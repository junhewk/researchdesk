import type { Provider } from "@/server/types";

export type LocalProvider = Extract<Provider, "ollama" | "lmstudio" | "llama_server">;

export const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "llama_server", label: "llama-server" },
];

const LOCAL_PROVIDER_VALUES = new Set<Provider>(["ollama", "lmstudio", "llama_server"]);

export const LOCAL_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(
  (option): option is { value: LocalProvider; label: string } =>
    LOCAL_PROVIDER_VALUES.has(option.value),
);

export const CLOUD_PROVIDER_VALUES: Provider[] = PROVIDER_OPTIONS.filter(
  (option) => !LOCAL_PROVIDER_VALUES.has(option.value),
).map((option) => option.value);

export function isProvider(value: string | null): value is Provider {
  return PROVIDER_OPTIONS.some((option) => option.value === value);
}

export function isLocalProvider(value: string | null): value is LocalProvider {
  return LOCAL_PROVIDER_OPTIONS.some((option) => option.value === value);
}
