import { getDb } from "./db";

export const apiProviderKeys = [
  "openai",
  "codex",
  "gemini",
  "deepseek",
  "ollama",
  "lmstudio",
  "llama_server",
] as const;

export type ApiProviderKey = (typeof apiProviderKeys)[number];

const providerSet = new Set<string>(apiProviderKeys);
const DEFAULT_PROVIDER_KEY = "default_api_provider";

interface ProviderRow {
  provider: ApiProviderKey;
  model: string | null;
  api_key: string | null;
  base_url: string | null;
  updated_at: number;
}

export interface PublicProviderSetting {
  provider: ApiProviderKey;
  model: string;
  baseUrl: string;
  savedApiKey: boolean;
  envApiKey: boolean;
  updatedAt: number | null;
}

export interface ProviderRuntimeSetting {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ProviderSettingsPayload {
  defaultProvider: ApiProviderKey;
  providers: PublicProviderSetting[];
}

export interface ProviderSettingsPatch {
  defaultProvider?: string;
  providers?: Array<{
    provider?: string;
    model?: string | null;
    apiKey?: string | null;
    clearApiKey?: boolean;
    baseUrl?: string | null;
  }>;
}

const API_KEY_ENV: Record<ApiProviderKey, string | null> = {
  openai: "OPENAI_API_KEY",
  codex: null,
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: null,
  lmstudio: "LMSTUDIO_API_KEY",
  llama_server: "LLAMA_SERVER_API_KEY",
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function isProvider(value: string | null | undefined): value is ApiProviderKey {
  return Boolean(value && providerSet.has(value));
}

function env(name: string | null): string | undefined {
  if (!name) return undefined;
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getProviderRow(provider: ApiProviderKey): ProviderRow | undefined {
  return getDb()
    .prepare("SELECT * FROM api_provider_settings WHERE provider = ?")
    .get(provider) as ProviderRow | undefined;
}

export function getDefaultApiProvider(): ApiProviderKey {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(DEFAULT_PROVIDER_KEY) as { value: string | null } | undefined;
  return isProvider(row?.value) ? row.value : "openai";
}

export function setDefaultApiProvider(provider: ApiProviderKey): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(DEFAULT_PROVIDER_KEY, provider);
}

export function getProviderRuntimeSetting(
  provider: ApiProviderKey,
): ProviderRuntimeSetting {
  const row = getProviderRow(provider);
  return {
    model: row?.model ?? undefined,
    apiKey: row?.api_key ?? env(API_KEY_ENV[provider]),
    baseUrl: row?.base_url ?? undefined,
  };
}

export function getPublicProviderSettings(): ProviderSettingsPayload {
  const rows = getDb()
    .prepare("SELECT * FROM api_provider_settings")
    .all() as ProviderRow[];
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return {
    defaultProvider: getDefaultApiProvider(),
    providers: apiProviderKeys.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        model: row?.model ?? "",
        baseUrl: row?.base_url ?? "",
        savedApiKey: Boolean(row?.api_key),
        envApiKey: Boolean(env(API_KEY_ENV[provider])),
        updatedAt: row?.updated_at ?? null,
      };
    }),
  };
}

export function updateProviderSettings(
  patch: ProviderSettingsPatch,
): ProviderSettingsPayload {
  if (patch.defaultProvider !== undefined) {
    if (!isProvider(patch.defaultProvider)) {
      throw new Error("Invalid default provider");
    }
    setDefaultApiProvider(patch.defaultProvider);
  }

  const upsert = getDb().prepare(
    `INSERT INTO api_provider_settings
       (provider, model, api_key, base_url, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(provider) DO UPDATE SET
       model = excluded.model,
       api_key = excluded.api_key,
       base_url = excluded.base_url,
       updated_at = excluded.updated_at`,
  );

  for (const next of patch.providers ?? []) {
    if (!isProvider(next.provider)) {
      throw new Error("Invalid provider");
    }

    const existing = getProviderRow(next.provider);
    const apiKey =
      next.clearApiKey
        ? null
        : clean(next.apiKey) ?? existing?.api_key ?? null;

    upsert.run(
      next.provider,
      clean(next.model),
      apiKey,
      clean(next.baseUrl),
    );
  }

  return getPublicProviderSettings();
}
