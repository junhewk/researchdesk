"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { STUDY_MODE_INFO } from "@/lib/methodsLabels";
import { formatDate } from "@/lib/utils";
import type { StudyArticleImportOption } from "@/server/studyArticle";

interface Props {
  initialOptions?: StudyArticleImportOption[];
  className?: string;
}

export function WorkbenchArticleImportPanel({
  initialOptions,
  className,
}: Props) {
  const router = useRouter();
  const [options, setOptions] = useState<StudyArticleImportOption[]>(
    initialOptions ?? [],
  );
  const [loading, setLoading] = useState(!initialOptions);
  const [error, setError] = useState<string | null>(null);
  const [busyStudyId, setBusyStudyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialOptions) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/study-article-imports?limit=100");
        const body = (await res.json().catch(() => ({}))) as {
          options?: StudyArticleImportOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || `failed (${res.status})`);
        if (active) {
          setOptions(body.options ?? []);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "could not load workbenches");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialOptions]);

  function importStudy(studyId: string) {
    setError(null);
    setBusyStudyId(studyId);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/studies/${studyId}/article`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reuse_existing: true }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || `import failed (${res.status})`);
        }
        const workspace =
          typeof body.links?.workspace === "string"
            ? body.links.workspace
            : typeof body.manuscript?.id === "string"
              ? `/my-articles/${body.manuscript.id}/workspace`
              : "/my-articles";
        router.push(workspace);
      } catch (err) {
        setError(err instanceof Error ? err.message : "import failed");
        setBusyStudyId(null);
      }
    });
  }

  return (
    <section
      id="import-workbench"
      className={`border-y border-[color:var(--color-outline-variant)] py-5 ${className ?? ""}`}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="label mb-1">Import from Workbench</h2>
          <p className="max-w-2xl text-[13px] text-[color:var(--color-on-surface-variant)]">
            Recommended: create article review from a Methods Workbench study so
            readiness checks and reviewer response drafting keep the planned
            methods as source data.
          </p>
        </div>
        <Link
          href="/methods-workbench/new"
          className="self-start text-[12px] font-mono uppercase text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-primary)] sm:self-auto"
        >
          New Workbench
        </Link>
      </div>

      {error && (
        <p className="mb-3 text-[12px] text-[color:var(--color-error)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-[12px] italic text-[color:var(--color-on-surface-variant)]">
          Loading workbenches...
        </p>
      ) : options.length === 0 ? (
        <div className="py-5 text-[13px] text-[color:var(--color-on-surface-variant)]">
          No Workbench studies yet.{" "}
          <Link
            href="/methods-workbench/new"
            className="font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
          >
            Start one first
          </Link>
          .
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
          {options.map((option) => {
            const modeInfo = STUDY_MODE_INFO[option.study.mode] ?? {
              label: option.study.mode,
              explain: "Study design",
            };
            const busy = busyStudyId === option.study.id || isPending;
            return (
              <li
                key={option.study.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={option.links.sourceStudy}
                    className="font-display text-[18px] leading-tight hover:text-[color:var(--color-primary)]"
                  >
                    {option.study.title}
                  </Link>
                  {option.study.research_question && (
                    <p className="mt-1 max-w-2xl text-[12px] italic text-[color:var(--color-on-surface-variant)]">
                      {option.study.research_question}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-on-surface-variant)]">
                    <span className="font-mono uppercase">{modeInfo.label}</span>
                    <span>{formatDate(option.study.updated_at)}</span>
                    {option.manuscript && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" strokeWidth={1.75} />
                        article review exists
                      </span>
                    )}
                  </div>
                </div>

                {option.manuscript && option.links.workspace ? (
                  <Link
                    href={option.links.workspace}
                    className="inline-flex shrink-0 items-center gap-1.5 self-start rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[12px] font-medium hover:border-[color:var(--color-outline)] transition-colors"
                  >
                    Open article review
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => importStudy(option.study.id)}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1.5 self-start rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
                  >
                    {busyStudyId === option.study.id ? "Importing..." : "Import to article review"}
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
