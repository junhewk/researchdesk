"use client";

import { useState } from "react";
import { Copy, Check, Download, Sparkles } from "lucide-react";

interface TaskPrompts {
  outline: string;
  introduction: string;
  methodology: string;
}

interface BriefResponse {
  combinedPrompt: string;
  taskPrompts: TaskPrompts;
  openCount: number;
  hasStudy: boolean;
}

interface Props {
  checkId: string;
  openCount: number;
}

const TASK_LABEL: Record<keyof TaskPrompts, string> = {
  outline: "Outline",
  introduction: "Introduction",
  methodology: "Methodology",
};

export function DraftingBriefPanel({ checkId, openCount }: Props) {
  const [data, setData] = useState<BriefResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/readiness/${checkId}/brief`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `failed (${res.status})`);
        return;
      }
      setData((await res.json()) as BriefResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(
        () => setCopied((c) => (c === key ? null : c)),
        1500,
      );
    } catch {
      setError("could not copy to clipboard");
    }
  };

  const download = async (format: "agents" | "md", filename: string) => {
    try {
      const res = await fetch(
        `/api/readiness/${checkId}/brief/download?format=${format}`,
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
    <section className="mt-10 border-t-2 border-[color:var(--color-on-surface)] pt-5">
      <h2 className="label mb-1">Drafting brief</h2>
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)]">
        Turn this reconciled check into a ready-to-use prompt for drafting the
        outline, introduction, and methodology. Paste a prompt into ChatGPT /
        Claude / Gemini, or download a file for an agentic tool — every prompt is
        self-contained.
      </p>

      {openCount > 0 && (
        <p className="mt-3 text-[12px] text-[color:var(--color-tertiary)]">
          {openCount} finding{openCount === 1 ? " is" : "s are"} still open —
          accept or dismiss {openCount === 1 ? "it" : "them"} above first for an
          accurate brief.
        </p>
      )}

      {!data && (
        <div className="mt-4">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] hover:border-[color:var(--color-outline)] disabled:opacity-40 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            {busy ? "Generating…" : "Generate drafting brief"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[12px] text-[color:var(--color-error)]">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-5 space-y-6">
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
                onClick={() => download("md", "drafting-brief.md")}
                className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[12px] font-mono hover:border-[color:var(--color-outline)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                drafting-brief.md
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--color-on-surface-variant)]">
              <span className="font-mono">AGENTS.md</span> is auto-read by Codex
              and similar agents; <span className="font-mono">drafting-brief.md</span>{" "}
              is a plain document to attach or upload anywhere.
            </p>
          </div>
        </div>
      )}
    </section>
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
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-on-surface)]">
        {text}
      </pre>
    </div>
  );
}
