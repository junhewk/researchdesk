import { Codex } from "@openai/codex-sdk";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  checkCodexRuntime,
  codexEnv,
  codexWorkspacePath,
} from "@/server/codexAuth";
import type { ApiAgentConfig, ApiChatModel } from "./providers";

const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";

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

function roleOf(message: unknown): string {
  const msg = message as BaseMessage;
  const type = typeof msg?._getType === "function" ? msg._getType() : "human";
  if (type === "system") return "SYSTEM";
  if (type === "ai") return "ASSISTANT";
  return "USER";
}

function messagesToPrompt(messages: unknown): string {
  const list = Array.isArray(messages) ? messages : [messages];
  return list.map((message) => {
    const msg = message as BaseMessage;
    return `${roleOf(message)}:\n${contentToText(msg?.content ?? message)}`;
  }).join("\n\n");
}

function abortSignalFrom(options: unknown): AbortSignal | undefined {
  if (!options || typeof options !== "object" || !("signal" in options)) return undefined;
  const signal = (options as { signal?: unknown }).signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty Codex response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("Codex response did not contain JSON");
  }
}

function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export class CodexChatModel implements ApiChatModel {
  constructor(
    private readonly config: ApiAgentConfig,
    private readonly temperature?: number,
  ) {}

  private async runCodex(
    prompt: string,
    opts?: { outputSchema?: Record<string, unknown>; signal?: AbortSignal },
  ): Promise<string> {
    const runtime = checkCodexRuntime();
    if (!runtime.available || !runtime.codexBinPath) {
      throw new Error(runtime.error ?? "Bundled Codex runtime is unavailable.");
    }

    const codex = new Codex({
      codexPathOverride: runtime.codexBinPath,
      env: codexEnv(runtime),
      config: {
        cli_auth_credentials_store: "file",
      },
    });
    const thread = codex.startThread({
      model: this.config.model || DEFAULT_CODEX_MODEL,
      workingDirectory: codexWorkspacePath(),
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
      modelReasoningEffort: this.temperature && this.temperature > 0.15 ? "medium" : "low",
    });
    const turn = await thread.run(prompt, {
      outputSchema: opts?.outputSchema,
      signal: opts?.signal,
    });
    const text = turn.finalResponse.trim();
    if (!text) throw new Error("empty Codex response");
    return text;
  }

  async invoke(messages: unknown, options?: unknown): Promise<{ content: unknown }> {
    const text = await this.runCodex(messagesToPrompt(messages), {
      signal: abortSignalFrom(options),
    });
    return { content: text };
  }

  withStructuredOutput<T>(
    schema: z.ZodType<T>,
    _config?: Record<string, unknown>,
  ): {
    invoke(messages: unknown, options?: unknown): Promise<T>;
  } {
    return {
      invoke: async (messages: unknown, options?: unknown): Promise<T> => {
        const text = await this.runCodex(messagesToPrompt(messages), {
          outputSchema: toOutputSchema(schema),
          signal: abortSignalFrom(options),
        });
        return schema.parse(extractJson(text));
      },
    };
  }
}
