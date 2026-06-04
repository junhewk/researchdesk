import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

export const apiProviderSchema = z.enum([
  "openai",
  "gemini",
  "deepseek",
  "ollama",
  "lmstudio",
  "llama_server",
]);

export type ApiProvider = z.infer<typeof apiProviderSchema>;

export function isLocalApiProvider(provider: ApiProvider): boolean {
  return provider === "ollama" || provider === "lmstudio" || provider === "llama_server";
}

export const apiAgentRequestSchema = z.object({
  provider: apiProviderSchema.default("openai"),
  model: z.string().trim().optional().nullable(),
  api_key: z.string().trim().optional().nullable(),
  base_url: z.string().trim().optional().nullable(),
  timeout_ms: z.number().int().positive().max(600_000).optional(),
  max_tool_steps: z.number().int().positive().max(12).optional(),
});

export type ApiAgentRequest = z.infer<typeof apiAgentRequestSchema>;

export interface ApiAgentConfig {
  provider: ApiProvider;
  model?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  timeoutMs?: number;
  maxToolSteps?: number;
}

export interface ApiChatModel {
  invoke(messages: unknown, options?: unknown): Promise<{ content: unknown }>;
  withStructuredOutput?<T>(
    schema: z.ZodType<T>,
    config?: Record<string, unknown>,
  ): {
    invoke(messages: unknown, options?: unknown): Promise<T>;
  };
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function openAiCompatibleUrl(url: string | null | undefined): string | undefined {
  const base = url?.trim().replace(/\/$/, "");
  if (!base) return undefined;
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

export async function createApiChatModel(
  config: ApiAgentConfig,
  opts?: { temperature?: number },
): Promise<ApiChatModel> {
  const temperature = opts?.temperature ?? 0.1;
  const timeout = config.timeoutMs ?? 180_000;

  if (config.provider === "gemini") {
    const mod = await import("@langchain/google-genai");
    return new mod.ChatGoogleGenerativeAI({
      model: config.model || env("GEMINI_MODEL") || "gemini-2.5-pro",
      apiKey: config.apiKey || env("GEMINI_API_KEY"),
      temperature,
      maxRetries: 1,
    }) as ApiChatModel;
  }

  if (config.provider === "ollama") {
    const mod = await import("@langchain/ollama");
    return new mod.ChatOllama({
      model: config.model || env("OLLAMA_MODEL") || "qwen3.6",
      baseUrl: config.baseUrl || env("OLLAMA_BASE_URL") || "http://127.0.0.1:11434",
      temperature,
    }) as ApiChatModel;
  }

  if (config.provider === "deepseek") {
    const mod = await import("@langchain/deepseek");
    return new mod.ChatDeepSeek({
      model: config.model || env("DEEPSEEK_MODEL") || "deepseek-chat",
      apiKey: config.apiKey || env("DEEPSEEK_API_KEY"),
      temperature,
    }) as ApiChatModel;
  }

  if (config.provider === "lmstudio") {
    return new ChatOpenAI({
      model: config.model || env("LMSTUDIO_MODEL") || "local-model",
      apiKey: config.apiKey || env("LMSTUDIO_API_KEY") || "lm-studio",
      temperature,
      timeout,
      configuration: {
        baseURL: openAiCompatibleUrl(config.baseUrl || env("LMSTUDIO_BASE_URL")) ||
          "http://127.0.0.1:1234/v1",
      },
    }) as ApiChatModel;
  }

  if (config.provider === "llama_server") {
    return new ChatOpenAI({
      model: config.model || env("LLAMA_SERVER_MODEL") || "local-model",
      apiKey: config.apiKey || env("LLAMA_SERVER_API_KEY") || "llama-server",
      temperature,
      timeout,
      configuration: {
        baseURL: openAiCompatibleUrl(config.baseUrl || env("LLAMA_SERVER_BASE_URL")) ||
          "http://127.0.0.1:8091/v1",
      },
    }) as ApiChatModel;
  }

  return new ChatOpenAI({
    model: config.model || env("OPENAI_MODEL") || env("OPENAI_AGENT_MODEL") || "gpt-5.4",
    apiKey: config.apiKey || env("OPENAI_API_KEY"),
    temperature,
    timeout,
  }) as ApiChatModel;
}
