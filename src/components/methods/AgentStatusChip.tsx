"use client";

import { useState } from "react";
import { useProviderHealth } from "@/lib/hooks/useProviderHealth";
import { PROVIDER_INFO } from "@/lib/methodsLabels";

/**
 * Header chip showing whether the AI assistant the canvas will use is
 * actually reachable — so a researcher learns about a stopped Ollama or a
 * missing API key before clicking an agent action, not after a 3-minute wait.
 */
export function AgentStatusChip({ provider }: { provider: string }) {
  const { health, loading, refresh } = useProviderHealth(provider);
  const [open, setOpen] = useState(false);
  const name = PROVIDER_INFO[provider]?.label ?? provider;

  if (loading && !health) {
    return (
      <span className="px-2 py-0.5 border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]">
        AI: checking…
      </span>
    );
  }
  if (!health) return null;

  if (health.ok) {
    return (
      <span
        title={health.detail}
        className="px-2 py-0.5 border border-[color:var(--color-on-secondary-container)] text-[color:var(--color-on-secondary-container)]"
      >
        AI: {name} ✓
      </span>
    );
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-0.5 border border-[color:var(--color-error)] text-[color:var(--color-error)] hover:bg-[color:var(--color-surface-container-low)]"
      >
        AI: {name} not ready
      </button>
      {open && (
        <span className="absolute right-0 top-full mt-1 z-50 block w-[300px] border border-[color:var(--color-ink)] bg-[color:var(--color-surface)] p-3 text-left normal-case tracking-normal font-sans">
          <span className="block text-[12px]">{health.detail}</span>
          {health.fix && (
            <span className="mt-1.5 block text-[12px] text-[color:var(--color-on-surface-variant)]">
              {health.fix}
            </span>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-2 text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-ink)] hover:text-[color:var(--color-redink)]"
          >
            Re-check
          </button>
        </span>
      )}
    </span>
  );
}
