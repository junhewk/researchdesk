import Link from "next/link";
import { getDb } from "@/server/db";
import { formatDate } from "@/lib/utils";
import type { ReviewerResponse } from "@/server/types";

export const dynamic = "force-dynamic";

type ResponseRow = ReviewerResponse & {
  manuscript_title: string;
  study_id: string | null;
};

function listResponseRows(): ResponseRow[] {
  return getDb()
    .prepare(
      `SELECT r.*, m.title AS manuscript_title, m.study_id
         FROM reviewer_responses r
         JOIN manuscripts m ON m.id = r.manuscript_id
        ORDER BY r.updated_at DESC`,
    )
    .all() as ResponseRow[];
}

export default function MethodsWorkbenchReviewerResponsesPage() {
  const rows = listResponseRows();

  return (
    <div className="reveal max-w-4xl">
      <Link
        href="/projects"
        className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
      >
        &larr; Research Projects
      </Link>
      <h1
        className="mt-3 font-display text-[42px] leading-none tracking-tight"
        style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}
      >
        Reviewer Responses
      </h1>

      {rows.length === 0 ? (
        <div className="mt-10 py-16 text-center border border-dashed border-[color:var(--color-outline-variant)] rounded">
          <p className="font-display italic text-[18px] text-[color:var(--color-on-surface-variant)]">
            No reviewer responses yet.
          </p>
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/projects/${row.study_id ?? row.manuscript_id}/review/reviewer-responses/${row.id}`}
                className="block py-5 group"
              >
                <div className="flex items-baseline gap-6">
                  <h2
                    className="font-display text-[22px] leading-tight flex-1 group-hover:text-[color:var(--color-primary)] transition-colors"
                    style={{ fontVariationSettings: "'opsz' 36, 'wght' 420" }}
                  >
                    {row.manuscript_title}
                  </h2>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]">
                    round {row.round}
                  </span>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]">
                    {row.status}
                  </span>
                  <span className="shrink-0 w-20 text-right font-mono text-[11px] text-[color:var(--color-on-surface-variant)] tabular">
                    {formatDate(row.updated_at)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
