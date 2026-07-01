"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InputReadinessPanel } from "@/components/InputReadinessPanel";
import { useProviderHealth } from "@/lib/hooks/useProviderHealth";
import { buildWorkbenchSetupInputs } from "@/lib/inputReadiness";
import { PROVIDER_INFO } from "@/lib/methodsLabels";
import type { StudyMode } from "@/server/types";

const TRIAGE: Array<{
  mode: StudyMode;
  q: string;
  sub: string;
}> = [
  {
    mode: "systematic_review",
    q: "Synthesizing existing studies",
    sub: "You will search, screen, and combine published evidence → systematic review / meta-analysis.",
  },
  {
    mode: "scoping_review",
    q: "Mapping the literature",
    sub: "You will search, screen, and chart the breadth of evidence on a topic (PCC framing) → scoping review, mapped to PRISMA-ScR. Import your search + screening CSVs.",
  },
  {
    mode: "retrospective_observational",
    q: "Analyzing patient-level data",
    sub: "You have (or will obtain) routinely-collected records and no control over treatment allocation → retrospective observational study.",
  },
  {
    mode: "interventional",
    q: "Running a trial with an AI intervention",
    sub: "You will randomize participants and test an AI/LLM tool against a comparator → interventional (AI) trial, mapped to SPIRIT-AI / CONSORT-AI.",
  },
];

function LocalProviderStatus() {
  const { allHealth, loading, refresh } = useProviderHealth();
  const locals = allHealth.filter((h) => h.kind === "local");
  const anyOk = locals.some((h) => h.ok);

  return (
    <div className="mt-3 ml-6 border-l-2 border-[color:var(--color-outline-variant)] pl-3 text-[12px] space-y-1">
      {loading && locals.length === 0 ? (
        <p className="italic text-[color:var(--color-on-surface-variant)]">
          Checking for local AI apps…
        </p>
      ) : (
        <>
          {locals.map((h) => (
            <p key={h.provider} className={h.ok ? "" : "text-[color:var(--color-on-surface-variant)]"}>
              <span className="font-mono">{h.ok ? "✓" : "✗"}</span>{" "}
              <span className="font-medium">
                {PROVIDER_INFO[h.provider]?.label ?? h.provider}
              </span>{" "}
              — {h.detail}
              {!h.ok && h.fix ? ` ${h.fix}` : ""}
            </p>
          ))}
          {!anyOk && (
            <p className="text-[color:var(--color-error)]">
              No local AI app is running yet. You can still create the study and
              fill cards by hand; the AI features will wait until one is up.
            </p>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            className="font-mono text-[11px] uppercase tracking-wide hover:text-[color:var(--color-redink)]"
          >
            Re-check
          </button>
        </>
      )}
    </div>
  );
}

export default function NewStudyPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<StudyMode | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputItems = useMemo(
    () =>
      buildWorkbenchSetupInputs({
        title,
        mode,
        researchQuestion: question,
      }),
    [mode, question, title],
  );

  async function create() {
    if (!title.trim() || !mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          mode,
          research_question: question.trim() || undefined,
          confidentiality_mode: localOnly ? "local_only" : "cloud_default",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "could not create study");
      const study = body as { id: string };
      router.push(
        mode === "scoping_review"
          ? `/methods-workbench/${study.id}/corpus`
          : `/methods-workbench/${study.id}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setBusy(false);
    }
  }

  return (
    <div className="reveal max-w-2xl">
      <h1
        className="font-display text-[36px] leading-none tracking-tight mb-2"
        style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}
      >
        Start a study design
      </h1>
      <p className="mb-10 text-[14px] text-[color:var(--color-on-surface-variant)]">
        A few questions to set up the right decision canvas. You can refine
        everything later — nothing here is locked in.
      </p>

      <InputReadinessPanel
        title="What to prepare"
        description="Start with the required setup, then bring evidence/search material as the canvas asks for it."
        items={inputItems}
        className="mb-8"
      />

      <label className="label block mb-2">Working title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Early vasopressors and 30-day mortality in septic shock"
        className="w-full mb-8 bg-transparent border-b border-[color:var(--color-outline-variant)] py-2 text-[16px] font-display focus:outline-none focus:border-[color:var(--color-primary)]"
      />

      <label className="label block mb-2">Research question</label>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="What are you trying to find out?"
        className="w-full mb-8 bg-transparent border border-[color:var(--color-outline-variant)] rounded p-3 text-[14px] focus:outline-none focus:border-[color:var(--color-primary)]"
      />

      <label className="label block mb-3">What kind of study is this?</label>
      <div className="space-y-3 mb-8">
        {TRIAGE.map((t) => (
          <button
            key={t.mode}
            type="button"
            onClick={() => setMode(t.mode)}
            className={`block w-full text-left p-4 border rounded transition-colors ${
              mode === t.mode
                ? "border-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)]"
                : "border-[color:var(--color-outline-variant)] hover:border-[color:var(--color-on-surface-variant)]"
            }`}
          >
            <div className="font-display text-[17px]">{t.q}</div>
            <div className="mt-1 text-[12px] text-[color:var(--color-on-surface-variant)]">
              {t.sub}
            </div>
          </button>
        ))}
      </div>

      <div className="mb-10">
        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={(e) => setLocalOnly(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Keep this study private.</span>{" "}
            <span className="text-[color:var(--color-on-surface-variant)]">
              Nothing leaves this computer: the AI assistant runs on a local
              model (Ollama, LM Studio, or llama-server) instead of a cloud
              service. Requires one of those apps to be installed and running —
              we check for you below.
            </span>
          </span>
        </label>
        {localOnly && <LocalProviderStatus />}
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[color:var(--color-error)]">{error}</p>
      )}

      <button
        type="button"
        disabled={!title.trim() || !mode || busy}
        onClick={create}
        className="px-5 py-2 text-[13px] font-mono uppercase tracking-wide border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Creating…" : "Build the canvas →"}
      </button>
    </div>
  );
}
