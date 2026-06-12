import {
  apiProviderSchema,
  resolveProviderConfig,
  type ApiProvider,
} from "./apiAgent/providers";

/**
 * Cheap, no-token health probes for every AI provider, so the UI can tell a
 * researcher "Ollama isn't running" BEFORE they wait out a 3-minute agent
 * timeout. Local providers are probed via their model-list endpoints; cloud
 * providers via key presence plus a models call.
 */

export type ProviderHealthStatus =
  | "ok"
  | "no_key"
  | "unreachable"
  | "model_missing"
  | "error";

export interface ProviderHealth {
  provider: ApiProvider;
  kind: "cloud" | "local";
  status: ProviderHealthStatus;
  ok: boolean;
  /** Plain-language state, e.g. "Ollama answered at http://127.0.0.1:11434". */
  detail: string;
  /** Plain-language recovery step, null when healthy. */
  fix: string | null;
  model: string | null;
  endpoint: string | null;
  latency_ms: number | null;
  checked_at: number;
}

const LOCAL_TIMEOUT_MS = 2_500;
const CLOUD_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseModelName(name: string): string {
  return name.split(":")[0].toLowerCase();
}

export async function checkProvider(
  provider: ApiProvider,
  opts?: { timeoutMs?: number },
): Promise<ProviderHealth> {
  const resolved = resolveProviderConfig(provider);
  const startedAt = Date.now();
  const base: Omit<ProviderHealth, "status" | "ok" | "detail" | "fix"> = {
    provider,
    kind: resolved.kind,
    model: resolved.model,
    endpoint: resolved.kind === "local" ? resolved.baseUrl : null,
    latency_ms: null,
    checked_at: Math.floor(startedAt / 1000),
  };
  const done = (
    status: ProviderHealthStatus,
    detail: string,
    fix: string | null = null,
  ): ProviderHealth => ({
    ...base,
    status,
    ok: status === "ok",
    detail,
    fix,
    latency_ms: Date.now() - startedAt,
  });

  // Cloud providers without a key fail fast, no network call.
  if (resolved.kind === "cloud" && !resolved.apiKey) {
    return done(
      "no_key",
      `No API key configured for ${provider}.`,
      `Set ${resolved.keyEnvVar} in the .env file next to the app and restart it — or use a local provider instead.`,
    );
  }

  const timeoutMs =
    opts?.timeoutMs ?? (resolved.kind === "local" ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS);

  try {
    if (provider === "ollama") {
      const res = await fetchWithTimeout(`${resolved.baseUrl}/api/tags`, {}, timeoutMs);
      if (!res.ok) {
        return done("error", `Ollama answered at ${resolved.baseUrl} but returned an error (HTTP ${res.status}).`, "Restart Ollama and try again.");
      }
      const body = (await res.json()) as { models?: Array<{ name?: string }> };
      const names = (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
      const wanted = baseModelName(resolved.model);
      const found = names.some(
        (n) => n.toLowerCase() === resolved.model.toLowerCase() || baseModelName(n) === wanted,
      );
      if (!found) {
        return done(
          "model_missing",
          `Ollama is running at ${resolved.baseUrl}, but the model "${resolved.model}" isn't downloaded.`,
          `In a terminal, run: ollama pull ${resolved.model}`,
        );
      }
      return done("ok", `Ollama is running at ${resolved.baseUrl} with "${resolved.model}" available.`);
    }

    if (provider === "lmstudio" || provider === "llama_server") {
      const appName = provider === "lmstudio" ? "LM Studio" : "llama-server";
      const res = await fetchWithTimeout(
        `${resolved.baseUrl}/models`,
        resolved.apiKey ? { headers: { Authorization: `Bearer ${resolved.apiKey}` } } : {},
        timeoutMs,
      );
      if (!res.ok) {
        return done("error", `${appName} answered at ${resolved.baseUrl} but returned an error (HTTP ${res.status}).`, `Restart ${appName}'s server and try again.`);
      }
      const body = (await res.json()) as { data?: unknown[] };
      if (!Array.isArray(body.data) || body.data.length === 0) {
        return done(
          "model_missing",
          `${appName} is running at ${resolved.baseUrl}, but no model is loaded.`,
          provider === "lmstudio"
            ? "Open LM Studio, load a model, and start the local server (Developer tab)."
            : "Start llama-server with a model file (llama-server -m <model.gguf>).",
        );
      }
      return done("ok", `${appName} is running at ${resolved.baseUrl} with a model loaded.`);
    }

    // Cloud providers: probe the models endpoint with the configured key.
    let url: string;
    let init: RequestInit = {};
    if (provider === "gemini") {
      url = `${resolved.baseUrl}/models?key=${encodeURIComponent(resolved.apiKey ?? "")}`;
    } else {
      url = `${resolved.baseUrl}/models`;
      init = { headers: { Authorization: `Bearer ${resolved.apiKey}` } };
    }
    const res = await fetchWithTimeout(url, init, timeoutMs);
    if (res.status === 401 || res.status === 403 || (provider === "gemini" && res.status === 400)) {
      return done(
        "error",
        `The ${provider} API key was rejected.`,
        `Check ${resolved.keyEnvVar} in the .env file — the key may be expired or mistyped.`,
      );
    }
    if (!res.ok) {
      return done("error", `${provider} answered with HTTP ${res.status}.`, "Try again in a minute; if it persists, check the provider's status page.");
    }
    return done("ok", `${provider} is reachable and the API key works (model: ${resolved.model}).`);
  } catch (err) {
    if (resolved.kind === "local") {
      const startHint =
        provider === "ollama"
          ? "Start it with `ollama serve` (or open the Ollama app)"
          : provider === "lmstudio"
            ? "Open LM Studio and start the local server (Developer tab)"
            : "Start llama-server with a model file";
      return done(
        "unreachable",
        `Nothing is answering at ${resolved.baseUrl} — ${provider === "ollama" ? "Ollama" : provider === "lmstudio" ? "LM Studio" : "llama-server"} doesn't seem to be running.`,
        `${startHint}, then re-check. If it runs elsewhere, set ${resolved.baseUrlEnvVar}.`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return done(
      "unreachable",
      `Could not reach ${provider} (${message}).`,
      "Check your internet connection and try again.",
    );
  }
}

export async function checkAllProviders(): Promise<ProviderHealth[]> {
  const providers = apiProviderSchema.options;
  const results = await Promise.allSettled(providers.map((p) => checkProvider(p)));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          provider: providers[i],
          kind: resolveProviderConfig(providers[i]).kind,
          status: "error" as const,
          ok: false,
          detail: "Health check failed unexpectedly.",
          fix: "Try again.",
          model: null,
          endpoint: null,
          latency_ms: null,
          checked_at: Math.floor(Date.now() / 1000),
        },
  );
}

// ---------------------------------------------------------------------------
// Agent error classification — turns raw fetch/langchain/zod failures into a
// cause the UI can show with a recovery step, instead of "agent failed".
// ---------------------------------------------------------------------------

export type AgentErrorCode =
  | "timeout"
  | "endpoint_unreachable"
  | "missing_or_bad_key"
  | "bad_model_output"
  | "unknown";

export interface ClassifiedAgentError {
  code: AgentErrorCode;
  message: string;
  fix: string;
}

export function classifyAgentError(
  err: unknown,
  provider: ApiProvider,
): ClassifiedAgentError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const resolved = resolveProviderConfig(provider);
  const isLocal = resolved.kind === "local";
  const localName =
    provider === "ollama" ? "Ollama" : provider === "lmstudio" ? "LM Studio" : "llama-server";

  if (
    lower.includes("abort") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout")
  ) {
    return {
      code: "timeout",
      message: "The AI model didn't answer in time.",
      fix: isLocal
        ? `Local models can be slow to load — wait a moment and try again, or pick a smaller model in ${localName}.`
        : "Try again in a minute; if it keeps happening, the provider may be overloaded.",
    };
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("socket") ||
    lower.includes("network")
  ) {
    return {
      code: "endpoint_unreachable",
      message: isLocal
        ? `${localName} isn't answering at ${resolved.baseUrl}.`
        : `Could not reach ${provider}.`,
      fix: isLocal
        ? provider === "ollama"
          ? "Start Ollama (`ollama serve` or open the app), then try again."
          : `Start ${localName}'s local server, then try again.`
        : "Check your internet connection and try again.",
    };
  }

  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("permission") ||
    lower.includes("authentication")
  ) {
    return {
      code: "missing_or_bad_key",
      message: `The ${provider} API key is missing or was rejected.`,
      fix: resolved.keyEnvVar
        ? `Set ${resolved.keyEnvVar} in the .env file next to the app and restart it — or switch to a local provider.`
        : "Check the provider configuration in Settings.",
    };
  }

  if (
    lower.includes("did not contain json") ||
    lower.includes("empty model response") ||
    lower.includes("invalid_type") ||
    lower.includes("unexpected token") ||
    lower.includes("schema")
  ) {
    return {
      code: "bad_model_output",
      message: "The AI model replied in an unexpected format.",
      fix: isLocal
        ? "Smaller local models sometimes can't follow the required format — try again, or use a larger model."
        : "Try again; if it persists, try a different model.",
    };
  }

  return {
    code: "unknown",
    message: raw,
    fix: "Try again; if it persists, check the AI status in Settings.",
  };
}
