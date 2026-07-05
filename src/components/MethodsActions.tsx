"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Beaker, ClipboardCheck } from "lucide-react";

interface Props {
  manuscriptId: string;
  studyId?: string | null;
  projectId?: string;
}

interface LetterCommentary {
  id: string;
  source: string | null;
}

interface ManuscriptVersion {
  id: string;
}

export function MethodsActions({ manuscriptId, studyId, projectId }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [hasDecisionLetter, setHasDecisionLetter] = useState(false);
  const [hasVersion, setHasVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [letters, versions] = await Promise.all([
          fetch(`/api/manuscripts/${manuscriptId}/letters`).then((r) =>
            r.ok ? (r.json() as Promise<LetterCommentary[]>) : [],
          ),
          fetch(`/api/manuscripts/${manuscriptId}/versions`).then((r) =>
            r.ok ? (r.json() as Promise<ManuscriptVersion[]>) : [],
          ),
        ]);
        if (cancelled) return;
        setHasDecisionLetter(
          letters.some((c) => c.source === "decision_letter"),
        );
        setHasVersion(versions.length > 0);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manuscriptId]);

  // Use whichever AI provider is actually working right now, instead of
  // assuming OpenAI is configured. Returns null when none is healthy.
  const findWorkingProvider = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/providers/health");
      if (!res.ok) return null;
      const body = (await res.json()) as {
        providers?: Array<{ provider: string; ok: boolean }>;
      };
      return body.providers?.find((p) => p.ok)?.provider ?? null;
    } catch {
      return null;
    }
  };

  const runReadiness = () => {
    setError(null);
    startTransition(async () => {
      const provider = await findWorkingProvider();
      const res = await fetch(`/api/manuscripts/${manuscriptId}/readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          study_id: studyId ?? undefined,
          ...(provider ? { provider } : { skip_agent: true }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const fix = typeof body.fix === "string" ? ` — ${body.fix}` : "";
        setError((body.error || `failed (${res.status})`) + fix);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(
        `/projects/${projectId ?? studyId ?? manuscriptId}/review/readiness/${created.id}`,
      );
    });
  };

  const draftResponse = () => {
    setError(null);
    startTransition(async () => {
      const provider = await findWorkingProvider();
      const res = await fetch(
        `/api/manuscripts/${manuscriptId}/reviewer-responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            provider
              ? { provider, round: 1 }
              : { skip_agent: true, round: 1 },
          ),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const fix = typeof body.fix === "string" ? ` — ${body.fix}` : "";
        setError((body.error || `failed (${res.status})`) + fix);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(
        `/projects/${projectId ?? studyId ?? manuscriptId}/review/reviewer-responses/${created.id}`,
      );
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={runReadiness}
        disabled={busy || !hasVersion}
        title={
          hasVersion
            ? studyId
              ? "Run readiness check against the originating Methods study"
              : "Run readiness check"
            : "Upload at least one manuscript version first"
        }
        className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] disabled:opacity-40 transition-colors"
      >
        <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
        Readiness
      </button>
      <button
        type="button"
        onClick={draftResponse}
        disabled={busy || !hasDecisionLetter}
        title={
          hasDecisionLetter
            ? "Draft reviewer response"
            : "Upload a decision letter first"
        }
        className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] disabled:opacity-40 transition-colors"
      >
        <Beaker className="h-3.5 w-3.5" strokeWidth={1.75} />
        Reviewer response
      </button>
      {error && (
        <span className="text-[11px] text-[color:var(--color-error)]">
          {error}
        </span>
      )}
    </div>
  );
}
