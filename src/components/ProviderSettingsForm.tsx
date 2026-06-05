"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Save, Trash2 } from "lucide-react";

type Provider =
  | "openai"
  | "gemini"
  | "deepseek"
  | "ollama"
  | "lmstudio"
  | "llama_server";

interface PublicProviderSetting {
  provider: Provider;
  model: string;
  baseUrl: string;
  savedApiKey: boolean;
  envApiKey: boolean;
  updatedAt: number | null;
}

interface ProviderSettingsPayload {
  defaultProvider: Provider;
  providers: PublicProviderSetting[];
}

interface EditableProviderSetting extends PublicProviderSetting {
  apiKey: string;
  clearApiKey: boolean;
}

const LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  llama_server: "llama-server",
};

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-5.4",
  gemini: "gemini-2.5-pro",
  deepseek: "deepseek-chat",
  ollama: "qwen3.6",
  lmstudio: "local-model",
  llama_server: "local-model",
};

const BASE_URL_HINTS: Record<Provider, string> = {
  openai: "Optional OpenAI-compatible base URL",
  gemini: "Not used",
  deepseek: "Not used",
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234",
  llama_server: "http://127.0.0.1:8091",
};

function toEditable(payload: ProviderSettingsPayload): EditableProviderSetting[] {
  return payload.providers.map((provider) => ({
    ...provider,
    apiKey: "",
    clearApiKey: false,
  }));
}

export function ProviderSettingsForm() {
  const [defaultProvider, setDefaultProvider] = useState<Provider>("openai");
  const [providers, setProviders] = useState<EditableProviderSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings/providers");
        if (!response.ok) throw new Error(`Could not load settings (${response.status})`);
        const data = (await response.json()) as ProviderSettingsPayload;
        if (cancelled) return;
        setDefaultProvider(data.defaultProvider);
        setProviders(toEditable(data));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptions = useMemo(
    () => providers.map((provider) => provider.provider),
    [providers],
  );

  const patchProvider = (
    provider: Provider,
    patch: Partial<EditableProviderSetting>,
  ) => {
    setProviders((current) =>
      current.map((item) =>
        item.provider === provider ? { ...item, ...patch } : item,
      ),
    );
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider,
          providers: providers.map((provider) => ({
            provider: provider.provider,
            model: provider.model,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            clearApiKey: provider.clearApiKey,
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Could not save settings (${response.status})`);
      }
      const payload = data as ProviderSettingsPayload;
      setDefaultProvider(payload.defaultProvider);
      setProviders(toEditable(payload));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[color:var(--color-on-surface-variant)]">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        Loading provider settings
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight mb-1.5">
            API agent providers
          </h2>
          <p className="max-w-2xl text-[13px] leading-relaxed text-[color:var(--color-on-surface-variant)]">
            Stored locally and used by review, readiness, checklist, preflight,
            and reviewer-response agents. Environment variables still work as
            fallback values.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded bg-[color:var(--color-primary)] px-4 py-2.5 text-[14px] font-medium text-[color:var(--color-on-primary)] transition-colors hover:bg-[color:var(--color-primary-container)] disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : saved ? (
            <Check className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Save className="h-4 w-4" strokeWidth={2} />
          )}
          {saving ? "Saving" : saved ? "Saved" : "Save Providers"}
        </button>
      </div>

      <div className="mt-6">
        <label className="label block mb-1">Default provider</label>
        <select
          value={defaultProvider}
          onChange={(event) => {
            setDefaultProvider(event.target.value as Provider);
            setSaved(false);
          }}
          className="w-full max-w-sm rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-3 py-2 text-[13px] text-[color:var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
        >
          {providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {LABELS[provider]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8 divide-y divide-[color:var(--color-outline-variant)] border-y border-[color:var(--color-outline-variant)]">
        {providers.map((provider) => (
          <div key={provider.provider} className="py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-[16px] font-semibold text-[color:var(--color-on-surface)]">
                {LABELS[provider.provider]}
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-on-surface-variant)]">
                {provider.savedApiKey
                  ? "saved key"
                  : provider.envApiKey
                    ? "env key"
                    : "no key"}
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label block mb-1">Model</label>
                <input
                  value={provider.model}
                  onChange={(event) =>
                    patchProvider(provider.provider, { model: event.target.value })
                  }
                  placeholder={DEFAULT_MODELS[provider.provider]}
                  className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
                />
              </div>

              <div>
                <label className="label block mb-1">Base URL</label>
                <input
                  value={provider.baseUrl}
                  onChange={(event) =>
                    patchProvider(provider.provider, { baseUrl: event.target.value })
                  }
                  placeholder={BASE_URL_HINTS[provider.provider]}
                  disabled={
                    provider.provider === "gemini" ||
                    provider.provider === "deepseek"
                  }
                  className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)] disabled:opacity-45"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="label block mb-1">API key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(event) =>
                    patchProvider(provider.provider, {
                      apiKey: event.target.value,
                      clearApiKey: false,
                    })
                  }
                  placeholder={
                    provider.savedApiKey
                      ? "Saved key is kept unless replaced or cleared"
                      : provider.envApiKey
                        ? "Environment key is available"
                        : provider.provider === "ollama"
                          ? "Not required for default Ollama"
                          : "Paste API key"
                  }
                  className="min-w-0 flex-1 rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    patchProvider(provider.provider, {
                      apiKey: "",
                      clearApiKey: true,
                      savedApiKey: false,
                    })
                  }
                  disabled={!provider.savedApiKey && !provider.apiKey}
                  title="Clear saved key"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)] transition-colors hover:border-[color:var(--color-outline)] hover:text-[color:var(--color-on-surface)] disabled:opacity-35"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded border border-[color:var(--color-error)] px-3 py-2 text-[12px] text-[color:var(--color-error)]">
          {error}
        </p>
      )}
    </section>
  );
}
