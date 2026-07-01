"use client";

import { useState } from "react";
import { EVIDENCE_SOURCE_INFO } from "@/lib/methodsLabels";
import type { ProviderHealthView } from "@/lib/hooks/useProviderHealth";

type Tab = "notes" | "json";

const EXAMPLE_DIGEST = `{
  "digest": {
    "populations": ["Adults with septic shock"],
    "outcomes": [
      { "label": "30-day mortality", "detail": "Primary outcome in 7 prior RCTs" }
    ],
    "confounders": ["Baseline lactate", "Time to antibiotics"]
  }
}`;

async function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function errorText(j: { error?: unknown; fix?: unknown }, fallback: string): string {
  const error =
    typeof j.error === "string" && j.error
      ? j.error
      : j.error
        ? JSON.stringify(j.error)
        : fallback;
  return typeof j.fix === "string" && j.fix ? `${error} — ${j.fix}` : error;
}

/**
 * Evidence import. Default tab takes ordinary pasted text (notes, excerpts,
 * a deep-research report) and runs the structured extraction pass; the
 * Advanced tab takes a structured MDR/RW JSON snapshot with a digest.
 */
export function ImportEvidenceModal({
  base,
  requiresLocalProvider,
  activeProvider,
  agentHealth,
  onClose,
  onDone,
}: {
  base: string;
  requiresLocalProvider: boolean;
  activeProvider: string | null;
  agentHealth: ProviderHealthView | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("notes");
  const [source, setSource] = useState<"mdr" | "rw">("mdr");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const agentBlocked =
    !activeProvider ||
    (agentHealth != null && !agentHealth.ok);
  const agentBlockedReason =
    !activeProvider && requiresLocalProvider
      ? "This study is private, so the AI must run locally — pick Ollama, LM Studio, or llama-server in the header first."
      : !activeProvider
        ? "Pick where the AI runs first in the workbench header."
      : agentHealth && !agentHealth.ok
        ? `${agentHealth.detail}${agentHealth.fix ? ` — ${agentHealth.fix}` : ""}`
        : null;

  const providerBody = activeProvider ? { provider: activeProvider } : {};

  async function runExtraction(snapshotId: string): Promise<void> {
    const ex = await post(`${base}/snapshots/${snapshotId}/extract`, providerBody);
    const exj = await ex.json().catch(() => ({}));
    if (!ex.ok) {
      setError(errorText(exj, "the AI assistant could not read the notes"));
      setBusy(false);
      return;
    }
    const n = exj.extracted ?? 0;
    onDone(
      n > 0
        ? `Found ${n} evidence item(s) in your notes — they're in the tray on the left. Drag them onto the matching decision cards.`
        : "Nothing design-relevant was found in that text — try pasting more detail about populations, outcomes, or prior studies.",
    );
  }

  async function submitNotes() {
    setBusy(true);
    setError(null);
    const r = await post(`${base}/snapshots`, {
      source: "rw",
      label: "Pasted notes",
      data: text,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(errorText(j, "import failed"));
      setBusy(false);
      return;
    }
    await runExtraction(j.snapshot.id);
  }

  async function submitJson() {
    setBusy(true);
    setError(null);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      setError(
        `This doesn't look like JSON. If you're pasting ordinary notes, use the "Paste your notes" tab instead. (${err instanceof Error ? err.message : "parse error"})`,
      );
      setBusy(false);
      return;
    }
    const r = await post(`${base}/snapshots`, { source, data });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(errorText(j, "import failed"));
      setBusy(false);
      return;
    }
    if (j.has_digest) {
      onDone(
        `Imported the ${EVIDENCE_SOURCE_INFO[source]?.label ?? source} — ${j.extracted} evidence item(s) are in the tray on the left.`,
      );
      return;
    }
    // No digest: fall back to the same extraction pass as pasted notes.
    if (agentBlocked) {
      onDone(
        `Imported the snapshot, but it has no "digest" block and the AI assistant isn't available to read it${agentBlockedReason ? ` (${agentBlockedReason})` : ""}.`,
      );
      return;
    }
    await runExtraction(j.snapshot.id);
  }

  const submit = tab === "notes" ? submitNotes : submitJson;
  const notesDisabled = tab === "notes" && agentBlocked;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-ink)] rounded p-5 w-[620px] max-w-[92vw] max-h-[88vh] overflow-y-auto">
        <h2 className="font-display text-[20px] mb-1">Add evidence</h2>
        <p className="text-[12px] text-[color:var(--color-on-surface-variant)] mb-3">
          Evidence items are short facts from prior work — populations, outcomes,
          confounders — that you can attach to your design decisions.
        </p>

        <div className="flex gap-4 mb-3 text-[12px] border-b border-[color:var(--color-outline-variant)]">
          {(
            [
              { id: "notes", label: "Paste your notes" },
              { id: "json", label: "Advanced: structured snapshot (JSON)" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
              className={`pb-1.5 -mb-px border-b-2 ${
                tab === t.id
                  ? "border-[color:var(--color-ink)] text-[color:var(--color-ink)]"
                  : "border-transparent text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "notes" ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder="Paste anything: literature notes, a colleague's email, a deep-research report, bullet points about prior studies… The assistant will pull out populations, outcomes, confounders, and other design-relevant items."
              className="w-full bg-transparent border border-[color:var(--color-outline-variant)] rounded p-2 text-[13px] focus:outline-none focus:border-[color:var(--color-primary)]"
            />
            {notesDisabled && agentBlockedReason && (
              <p className="mt-2 text-[12px] text-[color:var(--color-error)]">
                {agentBlockedReason}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2 text-[12px]">
              <span className="text-[color:var(--color-on-surface-variant)]">Source:</span>
              {(["mdr", "rw"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`px-3 py-1 border rounded font-mono uppercase ${
                    source === s
                      ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]"
                      : "border-[color:var(--color-outline-variant)]"
                  }`}
                  title={EVIDENCE_SOURCE_INFO[s]?.explain}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => setShowHelp((h) => !h)}
                className="ml-auto text-[11px] underline text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
              >
                What&apos;s this?
              </button>
            </div>
            {showHelp && (
              <div className="mb-2 border-l-2 border-[color:var(--color-outline-variant)] pl-3 text-[11px] text-[color:var(--color-on-surface-variant)] space-y-1">
                <p>
                  <strong>{EVIDENCE_SOURCE_INFO.mdr.label}</strong> — {EVIDENCE_SOURCE_INFO.mdr.explain}
                </p>
                <p>
                  <strong>{EVIDENCE_SOURCE_INFO.rw.label}</strong> — {EVIDENCE_SOURCE_INFO.rw.explain}
                </p>
                <p>
                  A <code className="font-mono">{`{"digest": {...}}`}</code> block is
                  read directly with no AI involved. Example:
                </p>
                <pre className="font-mono text-[10px] bg-[color:var(--color-surface-container-low)] p-2 overflow-x-auto">
                  {EXAMPLE_DIGEST}
                </pre>
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder='Paste the snapshot JSON. A {"digest": {...}} block is imported directly; anything else is read by the AI assistant.'
              className="w-full bg-transparent border border-[color:var(--color-outline-variant)] rounded p-2 text-[12px] font-mono focus:outline-none focus:border-[color:var(--color-primary)]"
            />
          </>
        )}

        {error && <p className="mt-2 text-[12px] text-[color:var(--color-error)]">{error}</p>}
        {busy && (
          <p className="mt-2 text-[12px] italic text-[color:var(--color-on-surface-variant)]">
            Reading your notes — this can take a minute…
          </p>
        )}

        <div className="mt-3 flex gap-3 justify-end text-[12px]">
          <button onClick={onClose} className="text-[color:var(--color-on-surface-variant)]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim() || notesDisabled}
            className="px-4 py-1.5 border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] disabled:opacity-40 font-mono uppercase"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
