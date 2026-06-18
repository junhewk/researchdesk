"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Download, X } from "lucide-react";

interface TaskPrompts {
  outline: string;
  introduction: string;
  methodology: string;
}

interface DraftResponse {
  combinedPrompt: string;
  taskPrompts: TaskPrompts;
  hasDesign: boolean;
}

const TASK_LABEL: Record<keyof TaskPrompts, string> = {
  outline: "Outline",
  introduction: "Introduction",
  methodology: "Methodology",
};

export function StudyDraftingPromptsPanel({
  studyId,
  onClose,
}: {
  studyId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DraftResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Compile on open — the prompts are a pure projection of the recorded design.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/studies/${studyId}/drafting-prompts`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.error || `failed (${res.status})`);
          return;
        }
        if (!cancelled) setData((await res.json()) as DraftResponse);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError("could not copy to clipboard");
    }
  };

  const download = async (format: "agents" | "md", filename: string) => {
    try {
      const res = await fetch(
        `/api/studies/${studyId}/drafting-prompts/download?format=${format}`,
      );
      if (!res.ok) {
        setError(`download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("download failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="relative mt-8 w-full max-w-3xl bg-[color:var(--color-surface)] border-2 border-[color:var(--color-on-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <h2 className="label mb-1">Drafting prompts</h2>
        <p className="text-[13px] text-[color:var(--color-on-surface-variant)]">
          Ready-to-use prompts for drafting the article&apos;s outline,
          introduction, and methodology from this study&apos;s recorded design.
          Paste into ChatGPT / Claude / Gemini, or download a file for an agentic
          tool — every prompt is self-contained.
        </p>

        {busy && (
          <p className="mt-4 text-[12px] text-[color:var(--color-on-surface-variant)]">
            Generating…
          </p>
        )}
        {error && (
          <p className="mt-4 text-[12px] text-[color:var(--color-error)]">
            {error}
          </p>
        )}

        {data && (
          <div className="mt-5 space-y-6">
            {!data.hasDesign && (
              <p className="text-[12px] text-[color:var(--color-tertiary)]">
                No decisions recorded yet — fill in the study cards for a
                methodology grounded in your design.
              </p>
            )}

            <PromptBlock
              label="Full prompt — outline + introduction + methodology"
              copyKey="combined"
              text={data.combinedPrompt}
              copied={copied}
              onCopy={copy}
            />

            <div>
              <h3 className="label mb-2">Per-section prompts</h3>
              <div className="space-y-4">
                {(Object.keys(data.taskPrompts) as Array<keyof TaskPrompts>).map(
                  (task) => (
                    <PromptBlock
                      key={task}
                      label={TASK_LABEL[task]}
                      copyKey={task}
                      text={data.taskPrompts[task]}
                      copied={copied}
                      onCopy={copy}
                    />
                  ),
                )}
              </div>
            </div>

            <div>
              <h3 className="label mb-2">Download a file</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => download("agents", "AGENTS.md")}
                  className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[12px] font-mono hover:border-[color:var(--color-outline)] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  AGENTS.md
                </button>
                <button
                  type="button"
                  onClick={() => download("md", "drafting-prompts.md")}
                  className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[12px] font-mono hover:border-[color:var(--color-outline)] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  drafting-prompts.md
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptBlock({
  label,
  copyKey,
  text,
  copied,
  onCopy,
}: {
  label: string;
  copyKey: string;
  text: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const isCopied = copied === copyKey;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
          {label}
        </span>
        <button
          type="button"
          onClick={() => onCopy(copyKey, text)}
          className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)] transition-colors"
        >
          {isCopied ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2} />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.75} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-on-surface)]">
        {text}
      </pre>
    </div>
  );
}
