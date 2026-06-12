"use client";

import { useProviderHealth } from "@/lib/hooks/useProviderHealth";
import { PROVIDER_INFO } from "@/lib/methodsLabels";

/**
 * Live status of every AI provider: what's working, what's broken, and the
 * exact step to fix it. Shared by the Settings page and the Methods
 * Workbench setup panel.
 */
export function ProviderHealthPanel({ compact = false }: { compact?: boolean }) {
  const { allHealth, loading, refresh } = useProviderHealth();

  const order = (kind: string) => (kind === "local" ? 0 : 1);
  const sorted = [...allHealth].sort(
    (a, b) => order(a.kind) - order(b.kind) || a.provider.localeCompare(b.provider),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="label">AI status</span>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="text-[11px] font-mono uppercase tracking-wide hover:text-[color:var(--color-redink)] disabled:opacity-40"
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-[12px] italic text-[color:var(--color-on-surface-variant)]">
          {loading ? "Checking which AI providers are available…" : "No provider information yet — click Re-check."}
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
          {sorted.map((h) => {
            const info = PROVIDER_INFO[h.provider];
            return (
              <li key={h.provider} className="py-2.5">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`shrink-0 font-mono text-[13px] ${
                      h.ok
                        ? "text-[color:var(--color-on-secondary-container)]"
                        : "text-[color:var(--color-error)]"
                    }`}
                  >
                    {h.ok ? "✓" : "✗"}
                  </span>
                  <span className="shrink-0 w-28 text-[13px] font-medium">
                    {info?.label ?? h.provider}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
                    {h.kind === "local" ? "on this computer" : "cloud"}
                  </span>
                  {h.ok && h.model && (
                    <span className="ml-auto font-mono text-[11px] text-[color:var(--color-on-surface-variant)] truncate">
                      {h.model}
                    </span>
                  )}
                </div>
                {!compact && (
                  <p className="mt-1 ml-7 text-[12px] text-[color:var(--color-on-surface-variant)]">
                    {h.detail}
                  </p>
                )}
                {!h.ok && h.fix && (
                  <p className="mt-0.5 ml-7 text-[12px] text-[color:var(--color-ink)]">
                    → {h.fix}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
