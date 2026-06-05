"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function NewStudyPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<StudyMode | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) throw new Error("could not create study");
      const study = await res.json();
      router.push(`/methods-workbench/${study.id}`);
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

      <label className="flex items-center gap-2 mb-10 text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={localOnly}
          onChange={(e) => setLocalOnly(e.target.checked)}
        />
        <span>
          Local-only — confidential. All agent reasoning stays on the local
          provider.
        </span>
      </label>

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
