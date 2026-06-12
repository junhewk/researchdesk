"use client";

import { useCallback, useEffect, useState } from "react";

/** Mirror of src/server/providerHealth.ts ProviderHealth (client-safe copy). */
export interface ProviderHealthView {
  provider: string;
  kind: "cloud" | "local";
  status: "ok" | "no_key" | "unreachable" | "model_missing" | "error";
  ok: boolean;
  detail: string;
  fix: string | null;
  model: string | null;
  endpoint: string | null;
  latency_ms: number | null;
  checked_at: number;
}

const CACHE_TTL_MS = 60_000;

// Module-scope cache: the all-providers sweep costs a few seconds, so share
// one result across every component that asks within the TTL.
let cached: { at: number; providers: ProviderHealthView[] } | null = null;
let inflight: Promise<ProviderHealthView[]> | null = null;

async function fetchAll(force = false): Promise<ProviderHealthView[]> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.providers;
  }
  if (!inflight) {
    inflight = fetch("/api/providers/health")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((body: { providers?: ProviderHealthView[] }) => {
        const providers = body.providers ?? [];
        cached = { at: Date.now(), providers };
        return providers;
      })
      .catch(() => cached?.providers ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Live (60s-cached) health for one provider, or all when omitted. */
export function useProviderHealth(provider?: string | null) {
  const [allHealth, setAllHealth] = useState<ProviderHealthView[]>(
    cached?.providers ?? [],
  );
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async (force = true) => {
    setLoading(true);
    const providers = await fetchAll(force);
    setAllHealth(providers);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAll().then((providers) => {
      if (!active) return;
      setAllHealth(providers);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const health = provider
    ? allHealth.find((h) => h.provider === provider) ?? null
    : null;

  return { health, allHealth, loading, refresh };
}

/** One-off fresh check of a single provider (used as a pre-flight gate before
 * firing a long agent request). */
export async function checkProviderNow(
  provider: string,
): Promise<ProviderHealthView | null> {
  try {
    const r = await fetch(
      `/api/providers/health?provider=${encodeURIComponent(provider)}`,
    );
    if (!r.ok) return null;
    return (await r.json()) as ProviderHealthView;
  } catch {
    return null;
  }
}
