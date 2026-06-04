import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createApiChatModel,
  type ApiAgentConfig,
  type ApiChatModel,
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

export async function runStructured<T>(
  opts: StructuredRunOptions<T>,
): Promise<StructuredRunResult<T>> {
  const model = await createApiChatModel(opts.config, {
    temperature: opts.temperature,
  });
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
        const result = await invokeStructured(
          model,
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
