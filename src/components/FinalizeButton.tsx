"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface FinalizeButtonProps {
  manuscriptId: string;
  enabled: boolean;
}

/**
 * Single button that:
 *  1. Asks the user to confirm (inline expand, no modal library)
 *  2. POSTs to /api/manuscripts/[id]/finalize-run to dispatch the
 *     final submission pass
 *  3. Reports dispatch status in place
 */
export function FinalizeButton({ manuscriptId, enabled }: FinalizeButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/manuscripts/${manuscriptId}/finalize-run`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await res.json().catch(() => ({}));
      setConfirming(false);
      setNotice(
        "Finalize pass started. Refresh this page to see final files after it finishes.",
      );
      setRunning(false);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Failed to start finalize");
    }
  }, [manuscriptId]);

  if (confirming) {
    return (
      <div className="mt-5 space-y-2">
        <p className="text-[12px] leading-snug text-[color:var(--color-on-primary-container)]">
          The agent will read every reviewer point, write
          <code className="mx-1 rounded bg-[color:var(--color-on-primary)]/10 px-1 font-mono text-[11px]">
            response_to_reviewers_final.md
          </code>
          and
          <code className="mx-1 rounded bg-[color:var(--color-on-primary)]/10 px-1 font-mono text-[11px]">
            revision_table_final.md
          </code>
          in your project folder, and report a verdict. Status stays in_revision
          until you separately mark completed.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 rounded border border-[color:var(--color-on-primary)]/20 px-3 py-2 text-[13px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-on-primary)]/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-[color:var(--color-secondary-container)] px-3 py-2 text-[13px] font-semibold text-[color:var(--color-on-secondary-container)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-on-secondary)] disabled:opacity-60 transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Dispatching…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                Run finalize
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="text-[11px] text-[color:var(--color-on-primary)] opacity-90">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setConfirming(true);
        }}
        disabled={!enabled}
        className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded px-4 py-2.5 text-[14px] font-semibold transition-colors ${
          enabled
            ? "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-on-secondary)]"
            : "bg-[color:var(--color-on-primary)]/10 text-[color:var(--color-on-primary)]/40 cursor-not-allowed"
        }`}
      >
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        Finalize for Publication
      </button>
      {error && (
        <p className="mt-2 text-[11px] text-[color:var(--color-on-primary)]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-2 text-[11px] text-[color:var(--color-on-primary)]">
          {notice}
        </p>
      )}
    </>
  );
}
