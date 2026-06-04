"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  protocolId: string;
  mode: "cloud_default" | "local_only";
  consentAt: number | null;
}

export function ConfidentialityToggle({ protocolId, mode, consentAt }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(mode);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);

  const submit = (next: "cloud_default" | "local_only", consent: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/protocols/${protocolId}/confidentiality`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next, consent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `failed (${res.status})`);
        return;
      }
      setCurrent(next);
      setShowConsent(false);
      router.refresh();
    });
  };

  const onClick = () => {
    const next = current === "cloud_default" ? "local_only" : "cloud_default";
    if (next === "cloud_default") {
      setShowConsent(true);
      return;
    }
    submit(next, false);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`text-[11px] font-mono uppercase tracking-wide border px-2.5 py-1 transition-colors ${
          current === "local_only"
            ? "border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)] hover:bg-[color:var(--color-tertiary-container)] hover:text-[color:var(--color-on-tertiary-container)]"
            : "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)] hover:bg-[color:var(--color-surface-container)]"
        }`}
      >
        {busy
          ? "…"
          : current === "local_only"
            ? "local-only · click to allow cloud"
            : "cloud-default · click for local-only"}
      </button>
      {consentAt && current === "cloud_default" && (
        <p className="text-[10px] font-mono text-[color:var(--color-on-surface-variant)] tabular">
          consent recorded {new Date(consentAt * 1000).toISOString().slice(0, 10)}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-[color:var(--color-error)]">{error}</p>
      )}
      {showConsent && (
        <div className="mt-1 border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] p-3 text-[12px] max-w-xs">
          <p className="mb-2">
            Allow cloud providers (Claude/Codex) to read this protocol&apos;s
            full text and assets? This is recorded on the protocol.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit("cloud_default", true)}
              disabled={busy}
              className="text-[11px] font-mono uppercase tracking-wide bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] px-2 py-1"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => setShowConsent(false)}
              className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
