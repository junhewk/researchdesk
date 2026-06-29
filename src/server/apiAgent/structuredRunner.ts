import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createApiChatModel,
  resolveProviderConfig,
  type ApiAgentConfig,
  type ApiChatModel,
  type ApiProvider,
} from "./providers";

export interface StructuredRunOptions<T> {
  config: ApiAgentConfig;
  schema: z.ZodType<T>;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxRepairAttempts?: number;
}

export interface StructuredRunResult<T> {
  parsed: T;
  rawText: string;
  attempts: number;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return JSON.stringify(part);
    }).join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty model response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("model response did not contain JSON");
  }
}

async function invokeStructured<T>(
  model: ApiChatModel,
  schema: z.ZodType<T>,
  schemaName: string,
  messages: unknown[],
  signal: AbortSignal,
): Promise<{ parsed: T; rawText: string }> {
  if (model.withStructuredOutput) {
    try {
      const structured = model.withStructuredOutput(schema, {
        name: schemaName,
        method: "jsonMode",
      });
      const parsed = await structured.invoke(messages, { signal });
      return { parsed: schema.parse(parsed), rawText: JSON.stringify(parsed) };
    } catch {
      // Some providers expose withStructuredOutput but reject jsonMode. Fall
      // through to the portable JSON prompt path.
    }
  }

  const result = await model.invoke(messages, { signal });
  const rawText = contentToText(result.content);
  return { parsed: schema.parse(extractJson(rawText)), rawText };
}

// Local OpenAI-compatible servers (llama.cpp's llama-server, LM Studio) accept
// `response_format: {type:"json_schema", ...}` and GRAMMAR-CONSTRAIN generation to
// the schema — including enums — which is what actually makes a small/local model
// (e.g. Qwen3) emit valid, non-empty structured output. LangChain's jsonMode only
// sends `{type:"json_object"}` (valid JSON, but unconstrained), so qwen returns
// empty items / omits fields. We bypass LangChain for these providers and post the
// grammar-constrained request directly, with the Qwen3 instruct sampling recipe.
const GRAMMAR_PROVIDERS = new Set<ApiProvider>(["llama_server", "lmstudio"]);

function isGrammarConstrainedProvider(provider: ApiProvider): boolean {
  return GRAMMAR_PROVIDERS.has(provider);
}

// Qwen3 (non-thinking / instruct) sampling recommendation. Grammar decoding also
// suppresses any <think> preamble, so the content is pure JSON.
const QWEN_SAMPLING = { top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toOpenAiMessages(messages: unknown[]): { role: string; content: string }[] {
  return messages.map((m) => {
    const msg = m as BaseMessage;
    const type = typeof msg?._getType === "function" ? msg._getType() : "human";
    const role = type === "system" ? "system" : type === "ai" ? "assistant" : "user";
    return { role, content: contentToText(msg?.content) };
  });
}

/** Build the `response_format` for a local grammar-constrained call. Prefers a
 * json_schema grammar (Zod 4's native converter); if a schema can't be converted,
 * falls back to plain json_object so the call still returns valid JSON. */
function grammarResponseFormat(
  schema: z.ZodType,
  schemaName: string,
): Record<string, unknown> {
  try {
    const js = z.toJSONSchema(schema) as Record<string, unknown>;
    // Strip `$schema` — the grammar parser doesn't need it; keep enums, the
    // anyOf-null nullable shape, and the required list that drive the grammar.
    delete js.$schema;
    return { type: "json_schema", json_schema: { name: schemaName, schema: js } };
  } catch {
    return { type: "json_object" };
  }
}

async function invokeGrammarConstrained<T>(
  config: ApiAgentConfig,
  schema: z.ZodType<T>,
  schemaName: string,
  messages: unknown[],
  temperature: number | undefined,
  signal: AbortSignal,
): Promise<{ parsed: T; rawText: string }> {
  const resolved = resolveProviderConfig(config.provider, {
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
  const body: Record<string, unknown> = {
    model: resolved.model,
    messages: toOpenAiMessages(messages),
    // Qwen3 instruct recommends ~0.7; honor an explicit caller temperature.
    temperature: temperature ?? 0.7,
    ...QWEN_SAMPLING,
    // Headroom so merged/long outputs don't truncate into invalid JSON; bumped
    // on a length finish.
    max_tokens: 4096,
    response_format: grammarResponseFormat(schema, schemaName),
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (resolved.apiKey) headers.Authorization = `Bearer ${resolved.apiKey}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(`${resolved.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.status === 429) {
        // Local servers typically serve one slot; back off and retry.
        lastError = new Error("local server busy (429)");
        await sleep(1200 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${config.provider}`);
      const j = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };
      const choice = j.choices?.[0];
      if (choice?.finish_reason === "length" && (body.max_tokens as number) < 8192) {
        // Output was cut off — grow the budget and retry rather than parse junk.
        body.max_tokens = Math.min(8192, (body.max_tokens as number) * 2);
        continue;
      }
      const rawText = contentToText(choice?.message?.content ?? "");
      return { parsed: schema.parse(extractJson(rawText)), rawText };
    } catch (err) {
      lastError = err;
      // Network/abort errors retry with backoff; a schema/JSON error bubbles to
      // the outer repair loop (which appends a corrective message).
      if (err instanceof Error && /HTTP \d|aborted|fetch failed|network/i.test(err.message)) {
        await sleep(700 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("grammar-constrained call failed");
}

export async function runStructured<T>(
  opts: StructuredRunOptions<T>,
): Promise<StructuredRunResult<T>> {
  const useGrammar = isGrammarConstrainedProvider(opts.config.provider);
  // Only build the LangChain client for the non-grammar (cloud / Ollama) path;
  // the grammar path posts directly to the local server.
  const model = useGrammar
    ? null
    : await createApiChatModel(opts.config, { temperature: opts.temperature });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.config.timeoutMs ?? 180_000,
  );
  const maxAttempts = Math.max(1, (opts.maxRepairAttempts ?? 2) + 1);
  const messages: unknown[] = [
    new SystemMessage(opts.systemPrompt),
    new HumanMessage([
      opts.userPrompt,
      "",
      "Return only JSON matching the required schema. Do not include markdown.",
    ].join("\n")),
  ];

  try {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = useGrammar
          ? await invokeGrammarConstrained(
              opts.config,
              opts.schema,
              opts.schemaName,
              messages,
              opts.temperature,
              controller.signal,
            )
          : await invokeStructured(
              model!,
              opts.schema,
              opts.schemaName,
              messages,
              controller.signal,
            );
        return { ...result, attempts: attempt };
      } catch (err) {
        lastError = err;
        messages.push(
          new HumanMessage([
            "Your previous response failed validation.",
            err instanceof Error ? err.message : String(err),
            "Return corrected JSON only.",
          ].join("\n")),
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } finally {
    clearTimeout(timeout);
  }
}

export function truncateForPrompt(value: string, maxChars = 80_000): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Truncated ${value.length - maxChars} chars]`;
}
