"use client";

import { cn } from "@/lib/utils";
import { PROVIDER_OPTIONS } from "@/lib/providers";
import type { Provider } from "@/server/types";

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  excluded?: Provider[];
  excludedReason?: string;
}

export function ProviderSelector({
  value,
  onChange,
  excluded,
  excludedReason,
}: ProviderSelectorProps) {
  const excludedSet = new Set(excluded ?? []);
  return (
    <div>
      <div className="label mb-2">Provider</div>
      <div className="flex gap-1">
        {PROVIDER_OPTIONS.map(({ value: key, label }) => {
          const isExcluded = excludedSet.has(key);
          return (
            <button
              key={key}
              onClick={() => !isExcluded && onChange(key)}
              disabled={isExcluded}
              title={isExcluded ? excludedReason : undefined}
              className={cn(
                "px-3 py-1.5 text-[12px] transition-colors",
                value === key
                  ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                  : "bg-[color:var(--color-paper-2)] text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]",
                isExcluded && "opacity-30 cursor-not-allowed hover:text-[color:var(--color-sepia)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {excludedReason && excludedSet.size > 0 && (
        <p className="mt-1 text-[10px] italic text-[color:var(--color-sepia)]">
          {excludedReason}
        </p>
      )}
    </div>
  );
}
