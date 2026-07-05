"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

interface DemoSeedResponse {
  studyId: string;
  manuscriptId: string;
  links?: {
    manuscriptWorkspace?: string;
  };
}

interface CreatedRecord {
  id: string;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  label: string,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(data?.error || `${label} failed (${response.status})`);
  }
  if (!data) throw new Error(`${label} returned an empty response`);
  return data;
}

export function DemoSeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seedDemo = async () => {
    setLoading(true);
    setStep("Creating demo");
    setError(null);

    try {
      const data = await postJson<DemoSeedResponse>(
        "/api/demo/seed",
        {},
        "Demo fixture",
      );

      setStep("Running preflight");
      await postJson(
        `/api/studies/${data.studyId}/preflight/run-risk`,
        {},
        "Preflight agent",
      );

      setStep("Running review");
      await postJson(
        `/api/manuscripts/${data.manuscriptId}/reviews/run-agent`,
        {},
        "Review agent",
      );

      setStep("Checking readiness");
      await postJson<CreatedRecord>(
        `/api/manuscripts/${data.manuscriptId}/readiness`,
        { study_id: data.studyId },
        "Readiness agent",
      );

      setStep("Drafting response");
      await postJson<CreatedRecord>(
        `/api/manuscripts/${data.manuscriptId}/reviewer-responses`,
        { round: 1 },
        "Reviewer-response agent",
      );

      const destination =
        data?.links?.manuscriptWorkspace ??
        (data?.manuscriptId
          ? `/projects/${data.studyId ?? data.manuscriptId}/review?center=peer`
          : "/");

      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoading(false);
      setStep(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={seedDemo}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-2.5 text-[14px] font-medium text-[color:var(--color-on-surface)] transition-colors hover:border-[color:var(--color-outline)] hover:bg-[color:var(--color-surface-container-low)] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Play className="h-4 w-4" strokeWidth={2} />
        )}
        {loading ? (step ?? "Loading demo") : "Load Demo Set"}
      </button>
      {error && (
        <span className="max-w-[220px] text-right text-[11px] leading-snug text-[color:var(--color-error)]">
          {error}
        </span>
      )}
    </div>
  );
}
