import Link from "next/link";
import { listStudies } from "@/server/studies";
import { getDb } from "@/server/db";
import { formatDate } from "@/lib/utils";
import { MethodsDemoSeedButton } from "@/components/MethodsDemoSeedButton";
import type { ReadinessCheck, ReviewerResponse } from "@/server/types";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  interventional: "AI-intervention trial",
  systematic_review: "systematic review",
  retrospective_observational: "retrospective observational",
};

interface CrossWorkRow {
  kind: "readiness" | "reviewer_response";
  id: string;
  manuscript_title: string;
  status: string;
  updated_at: number;
}

function listCrossWorkspaceItems(): CrossWorkRow[] {
  const db = getDb();
  const readiness = db
    .prepare(
      `SELECT r.id, r.status, r.updated_at, m.title AS manuscript_title
       FROM readiness_checks r JOIN manuscripts m ON m.id = r.manuscript_id
       ORDER BY r.updated_at DESC LIMIT 25`,
    )
    .all() as Array<ReadinessCheck & { manuscript_title: string }>;
  const responses = db
    .prepare(
      `SELECT r.id, r.status, r.updated_at, m.title AS manuscript_title
       FROM reviewer_responses r JOIN manuscripts m ON m.id = r.manuscript_id
       ORDER BY r.updated_at DESC LIMIT 25`,
    )
    .all() as Array<ReviewerResponse & { manuscript_title: string }>;
  const all: CrossWorkRow[] = [
    ...readiness.map((r) => ({
      kind: "readiness" as const,
      id: r.id,
      manuscript_title: r.manuscript_title,
      status: r.status,
      updated_at: r.updated_at,
    })),
    ...responses.map((r) => ({
      kind: "reviewer_response" as const,
      id: r.id,
      manuscript_title: r.manuscript_title,
      status: r.status,
      updated_at: r.updated_at,
    })),
  ];
  all.sort((a, b) => b.updated_at - a.updated_at);
  return all.slice(0, 25);
}

export default function MethodsWorkbenchPage() {
  const studies = listStudies();
  const crossWork = listCrossWorkspaceItems();

  return (
    <div className="reveal">
      <div className="flex items-baseline justify-between mb-3">
        <h1
          className="font-display text-[42px] leading-none tracking-tight"
          style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}
        >
          Methods Workbench
        </h1>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <MethodsDemoSeedButton />
          <Link
            href="/methods-workbench/new"
            className="inline-flex items-center rounded px-4 py-2.5 text-[14px] font-medium bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] transition-colors"
          >
            + Start a study
          </Link>
        </div>
      </div>
      <p className="mb-12 max-w-2xl text-[14px] text-[color:var(--color-on-surface-variant)]">
        Form and audit research-design decisions <em>before</em> any document
        exists. Import evidence, work the decision canvas, watch the preflight
        inspector, then compile protocol / SAP / checklist artifacts.
      </p>

      <h2 className="label mb-4">Studies</h2>
      {studies.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[color:var(--color-outline-variant)] rounded">
          <p className="font-display italic text-[18px] text-[color:var(--color-on-surface-variant)]">
            No studies yet.
          </p>
          <p className="mt-2 text-[13px]">
            <Link href="/methods-workbench/new" className="underline underline-offset-4">
              Start a study design →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
          {studies.map((s) => (
            <li key={s.id}>
              <Link href={`/methods-workbench/${s.id}`} className="block py-5 group">
                <div className="flex items-baseline gap-6">
                  <h3
                    className="font-display text-[22px] leading-tight flex-1 group-hover:text-[color:var(--color-primary)] transition-colors"
                    style={{ fontVariationSettings: "'opsz' 36, 'wght' 420" }}
                  >
                    {s.title}
                  </h3>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]">
                    {MODE_LABEL[s.mode] ?? s.mode}
                  </span>
                  {s.confidentiality_mode === "local_only" && (
                    <span className="shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]">
                      local-only
                    </span>
                  )}
                  <span className="shrink-0 w-20 text-right font-mono text-[11px] text-[color:var(--color-on-surface-variant)] tabular">
                    {formatDate(s.updated_at)}
                  </span>
                </div>
                {s.research_question && (
                  <div className="mt-1 text-[12px] text-[color:var(--color-on-surface-variant)] italic font-display">
                    {s.research_question}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {crossWork.length > 0 && (
        <section className="mt-16">
          <h2 className="label mb-4">Cross-workspace work</h2>
          <p className="mb-4 text-[12px] text-[color:var(--color-on-surface-variant)]">
            Manuscript-stage readiness checks and reviewer responses from My
            Articles.
          </p>
          <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
            {crossWork.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={
                    item.kind === "readiness"
                      ? `/methods-workbench/readiness/${item.id}`
                      : `/methods-workbench/reviewer-responses/${item.id}`
                  }
                  className="flex items-baseline gap-4 py-3 text-[13px] group"
                >
                  <span className="shrink-0 w-32 font-mono uppercase tracking-wide text-[10px] text-[color:var(--color-on-surface-variant)]">
                    {item.kind === "readiness" ? "readiness" : "response"}
                  </span>
                  <span className="flex-1 truncate group-hover:text-[color:var(--color-primary)] transition-colors">
                    {item.manuscript_title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] uppercase text-[color:var(--color-on-surface-variant)]">
                    {item.status}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[color:var(--color-on-surface-variant)] tabular w-20 text-right">
                    {formatDate(item.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
