"use client";

import { useState } from "react";
import { Copy, Check, Download, X } from "lucide-react";
import type { Provider } from "@/server/types";

type DraftTask =
  | "outline"
  | "introduction"
  | "methodology"
  | "results"
  | "discussion"
  | "abstract";

type TaskPrompts = Partial<Record<DraftTask, string>>;

interface DraftResponse {
  source: "agent";
  harnessVersion: number;
  methodology: string;
  sections: DraftTask[];
  combinedPrompt: string;
  taskPrompts: TaskPrompts;
  hasDesign: boolean;
  hasCorpus?: boolean;
  qualityWarnings?: string[];
  unresolvedQuestions?: string[];
  freeformPrompt?: string | null;
}

const TASK_LABEL: Record<DraftTask, string> = {
  outline: "Outline",
  introduction: "Introduction",
  methodology: "Methodology",
  results: "Results",
  discussion: "Discussion",
  abstract: "Abstract",
};

export function StudyDraftingPromptsPanel({
  studyId,
  provider,
  onClose,
  embedded = false,
}: {
  studyId: string;
  provider: Provider | null;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [data, setData] = useState<DraftResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    if (!provider) {
      setError("Choose an AI provider first.");
      setFix(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFix(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/drafting-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `generation failed (${res.status})`);
        setFix(body.fix ?? null);
        return;
      }
      setData(body as DraftResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
      setFix(null);
    } finally {
      setBusy(false);
    }
  };

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

  const content = (
    <div
      className={
        embedded
          ? "relative w-full rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] p-6"
          : "relative mt-8 w-full max-w-3xl bg-[color:var(--color-surface)] border-2 border-[color:var(--color-on-surface)] p-6"
      }
      onClick={(e) => {
        if (!embedded) e.stopPropagation();
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}

      <h2 className="label mb-1">Drafting prompts</h2>
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)]">
        Generate an article-writing harness with the selected AI provider.
        The app supplies the recorded design, guideline coverage, and corpus
        as grounding; the agent writes the section contracts and workflow.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            Provider
          </p>
          <p className="text-[13px] text-[color:var(--color-on-surface)]">
            {provider ?? "Not selected"}
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !provider}
          className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-ink)] bg-[color:var(--color-ink)] px-3 py-1.5 text-[12px] font-mono text-[color:var(--color-paper)] transition-colors hover:bg-[color:var(--color-redink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Generating..." : data ? "Regenerate" : "Generate with agent"}
        </button>
      </div>

      {busy && (
        <p className="mt-4 text-[12px] text-[color:var(--color-on-surface-variant)]">
          Generating article-writing harness...
        </p>
      )}
      {error && (
        <div className="mt-4 text-[12px] text-[color:var(--color-error)]">
          <p>{error}</p>
          {fix && <p className="mt-1 text-[color:var(--color-on-surface-variant)]">{fix}</p>}
        </div>
      )}

      {!data && !busy && !error && (
        <p className="mt-4 text-[12px] text-[color:var(--color-on-surface-variant)]">
          No harness generated yet.
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

          <div className="text-[12px] text-[color:var(--color-on-surface-variant)]">
            <p>
              Harness v{data.harnessVersion} · {data.methodology}
            </p>
            {data.qualityWarnings && data.qualityWarnings.length > 0 && (
              <div className="mt-2">
                <p className="label mb-1">Quality warnings</p>
                <ul className="list-disc space-y-1 pl-5">
                  {data.qualityWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.unresolvedQuestions && data.unresolvedQuestions.length > 0 && (
              <div className="mt-2">
                <p className="label mb-1">Questions for the author</p>
                <ul className="list-disc space-y-1 pl-5">
                  {data.unresolvedQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <PromptBlock
            label="Full prompt — all sections"
            copyKey="combined"
            text={data.combinedPrompt}
            copied={copied}
            onCopy={copy}
          />

          <div>
            <h3 className="label mb-2">Per-section prompts</h3>
            <div className="space-y-4">
              {(Object.keys(data.taskPrompts) as DraftTask[]).map((task) => (
                <PromptBlock
                  key={task}
                  label={TASK_LABEL[task] ?? task}
                  copyKey={task}
                  text={data.taskPrompts[task] ?? ""}
                  copied={copied}
                  onCopy={copy}
                />
              ))}
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
  );

  if (embedded) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onClose}
    >
      {content}
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
