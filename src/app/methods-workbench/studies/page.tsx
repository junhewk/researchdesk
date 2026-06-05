import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { listStudies } from "@/server/studies";
import { MethodsDemoSeedButton } from "@/components/MethodsDemoSeedButton";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  interventional: "interventional",
  systematic_review: "systematic review",
  retrospective_observational: "retrospective observational",
};

export default function MethodsWorkbenchStudiesPage() {
  const studies = listStudies();

  return (
    <div className="reveal max-w-4xl">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <Link
            href="/methods-workbench"
            className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
          >
            &larr; Methods Workbench
          </Link>
          <h1
            className="mt-3 font-display text-[42px] leading-none tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}
          >
            Studies
          </h1>
        </div>
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

      {studies.length === 0 ? (
        <div className="mt-10 py-16 text-center border border-dashed border-[color:var(--color-outline-variant)] rounded">
          <p className="font-display italic text-[18px] text-[color:var(--color-on-surface-variant)]">
            No studies yet.
          </p>
          <p className="mt-2 text-[13px]">
            <Link href="/methods-workbench/new" className="underline underline-offset-4">
              Start a study design &rarr;
            </Link>
          </p>
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
          {studies.map((study) => (
            <li key={study.id}>
              <Link href={`/methods-workbench/${study.id}`} className="block py-5 group">
                <div className="flex items-baseline gap-6">
                  <h2
                    className="font-display text-[22px] leading-tight flex-1 group-hover:text-[color:var(--color-primary)] transition-colors"
                    style={{ fontVariationSettings: "'opsz' 36, 'wght' 420" }}
                  >
                    {study.title}
                  </h2>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]">
                    {MODE_LABEL[study.mode] ?? study.mode}
                  </span>
                  <span className="shrink-0 w-20 text-right font-mono text-[11px] text-[color:var(--color-on-surface-variant)] tabular">
                    {formatDate(study.updated_at)}
                  </span>
                </div>
                {study.research_question && (
                  <p className="mt-1 text-[12px] text-[color:var(--color-on-surface-variant)] italic font-display">
                    {study.research_question}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
