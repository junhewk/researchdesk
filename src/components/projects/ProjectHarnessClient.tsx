"use client";

import { useEffect, useState } from "react";
import { ProviderSelector } from "@/components/ProviderSelector";
import { StudyDraftingPromptsPanel } from "@/components/methods/StudyDraftingPromptsPanel";
import { CLOUD_PROVIDER_VALUES, isProvider } from "@/lib/providers";
import type { Provider } from "@/server/types";

function initialProvider(localOnly: boolean): Provider {
  return localOnly ? "ollama" : "openai";
}

export function ProjectHarnessClient({
  studyId,
  localOnly,
}: {
  studyId: string;
  localOnly: boolean;
}) {
  const [provider, setProvider] = useState<Provider>(() => initialProvider(localOnly));

  useEffect(() => {
    let active = true;
    fetch("/api/settings/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { defaultProvider?: string } | null) => {
        if (!active) return;
        const configured = data?.defaultProvider ?? null;
        if (isProvider(configured) && !(localOnly && CLOUD_PROVIDER_VALUES.includes(configured))) {
          setProvider(configured);
        }
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      active = false;
    };
  }, [localOnly]);

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-4">
        <ProviderSelector
          value={provider}
          onChange={setProvider}
          excluded={localOnly ? CLOUD_PROVIDER_VALUES : undefined}
          excludedReason={
            localOnly
              ? "This project is local-only, so cloud providers are disabled."
              : undefined
          }
        />
      </section>
      <StudyDraftingPromptsPanel studyId={studyId} provider={provider} embedded />
    </div>
  );
}
