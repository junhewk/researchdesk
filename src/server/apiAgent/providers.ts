import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  getDefaultApiProvider,
  getProviderRuntimeSetting,
  type ApiProviderKey,
} from "@/server/providerSettings";

export const apiProviderSchema = z.enum([
  "openai",
  "gemini",
  "deepseek",
  "ollama",
  "lmstudio",
  "llama_server",
]);

export type ApiProvider = z.infer<typeof apiProviderSchema>;

export const localApiProviders = [
  "ollama",
  "lmstudio",
  "llama_server",
] as const satisfies readonly ApiProvider[];

export type LocalApiProvider = (typeof localApiProviders)[number];

const localApiProviderSet = new Set<ApiProvider>(localApiProviders);

export function isLocalApiProvider(provider: ApiProvider): provider is LocalApiProvider {
  return localApiProviderSet.has(provider);
}

export function providerFieldWasProvided(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body, "provider")
  );
}

export function resolveApiProvider(
  provider: ApiProvider | undefined,
  providerWasProvided: boolean,
): ApiProvider {
  return providerWasProvided && provider ? provider : getDefaultApiProvider();
}

export function requireLocalApiProvider(
  provider: ApiProvider | undefined,
  providerWasProvided: boolean,
): { provider: LocalApiProvider | null; error: string | null } {
  const providerList = localApiProviders.join(", ");
  if (!providerWasProvided) {
    return {
      provider: null,
      error: `study is local_only; choose a local provider: ${providerList}`,
    };
  }
  if (!provider || !isLocalApiProvider(provider)) {
    return {
      provider: null,
      error: `study is local_only; use ${providerList}`,
    };
  }
  return { provider, error: null };
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
  const saved = getProviderRuntimeSetting(config.provider as ApiProviderKey);
  const model = config.model || saved.model;
  const apiKey = config.apiKey || saved.apiKey;
  const baseUrl = config.baseUrl || saved.baseUrl;

  if (config.provider === "gemini") {
    const mod = await import("@langchain/google-genai");
    return new mod.ChatGoogleGenerativeAI({
      model: model || env("GEMINI_MODEL") || "gemini-2.5-pro",
      apiKey: apiKey || env("GEMINI_API_KEY"),
      temperature,
      maxRetries: 1,
    }) as ApiChatModel;
  }

  if (config.provider === "ollama") {
    const mod = await import("@langchain/ollama");
    return new mod.ChatOllama({
      model: model || env("OLLAMA_MODEL") || "qwen3.6",
      baseUrl: baseUrl || env("OLLAMA_BASE_URL") || "http://127.0.0.1:11434",
      temperature,
    }) as ApiChatModel;
  }

  if (config.provider === "deepseek") {
    const mod = await import("@langchain/deepseek");
    return new mod.ChatDeepSeek({
      model: model || env("DEEPSEEK_MODEL") || "deepseek-chat",
      apiKey: apiKey || env("DEEPSEEK_API_KEY"),
      temperature,
    }) as ApiChatModel;
  }

  if (config.provider === "lmstudio") {
    return new ChatOpenAI({
      model: model || env("LMSTUDIO_MODEL") || "local-model",
      apiKey: apiKey || env("LMSTUDIO_API_KEY") || "lm-studio",
      temperature,
      timeout,
      configuration: {
        baseURL: openAiCompatibleUrl(baseUrl || env("LMSTUDIO_BASE_URL")) ||
          "http://127.0.0.1:1234/v1",
      },
    }) as ApiChatModel;
  }

  if (config.provider === "llama_server") {
    return new ChatOpenAI({
      model: model || env("LLAMA_SERVER_MODEL") || "local-model",
      apiKey: apiKey || env("LLAMA_SERVER_API_KEY") || "llama-server",
      temperature,
      timeout,
      configuration: {
        baseURL: openAiCompatibleUrl(baseUrl || env("LLAMA_SERVER_BASE_URL")) ||
          "http://127.0.0.1:8091/v1",
      },
    }) as ApiChatModel;
  }

  return new ChatOpenAI({
    model: model || env("OPENAI_MODEL") || env("OPENAI_AGENT_MODEL") || "gpt-5.4",
    apiKey: apiKey || env("OPENAI_API_KEY"),
    temperature,
    timeout,
    configuration: {
      baseURL: openAiCompatibleUrl(baseUrl || env("OPENAI_BASE_URL")),
    },
  }) as ApiChatModel;
}
