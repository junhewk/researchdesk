import Link from "next/link";
import { WorkbenchArticleImportPanel } from "@/components/WorkbenchArticleImportPanel";
import { listManuscripts } from "@/server/manuscripts";
import { listStudyArticleImportOptions } from "@/server/studyArticle";
import { formatDate } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/styles";

export default function ManuscriptsPage() {
  const manuscripts = listManuscripts();
  const importOptions = listStudyArticleImportOptions({ limit: 100 });

  return (
    <div className="reveal">
      <div className="flex items-baseline justify-between mb-12">
        <h1 className="font-display text-[42px] leading-none tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}>
          My articles
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="#import-workbench"
            className="rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] transition-colors"
          >
            Import from Workbench
          </Link>
          <Link
            href="/my-articles/new#direct-upload"
            className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-ink)]"
          >
            Create directly
          </Link>
        </div>
      </div>

      <WorkbenchArticleImportPanel
        initialOptions={importOptions}
        className="mb-12"
      />

      {manuscripts.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display italic text-[20px] text-[color:var(--color-sepia)]">
            No articles yet.
          </p>
          <p className="mt-2 text-[13px] text-[color:var(--color-on-surface-variant)]">
            Import a Workbench study above to start article review with source
            methods, or create a direct article without prior methods data.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--color-rule)] border-t border-[color:var(--color-rule)]">
          {manuscripts.map((m) => (
            <li key={m.id}>
              <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                <Link href={`/my-articles/${m.id}`} className="min-w-0 flex-1 group">
                  <div className="flex items-baseline gap-6">
                    <h2 className="font-display text-[22px] leading-tight flex-1 group-hover:text-[color:var(--color-redink)] transition-colors"
                      style={{ fontVariationSettings: "'opsz' 36, 'wght' 420" }}>
                      {m.title}
                    </h2>
                    <span className={`shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono ${STATUS_STYLES[m.status] || ""}`}>
                      {m.status.replace("_", " ")}
                    </span>
                    <span className="shrink-0 w-20 text-right font-mono text-[11px] text-[color:var(--color-sepia)] tabular">
                      {formatDate(m.updated_at)}
                    </span>
                  </div>
                  {(m.research_domain || m.journal_type || m.research_type) && (
                    <div className="mt-1 text-[12px] text-[color:var(--color-sepia)] italic font-display">
                      {[m.research_domain, m.research_type?.replace("-", " "), m.journal_type].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </Link>
                {m.study_id && (
                  <Link
                    href={`/methods-workbench/${m.study_id}`}
                    className="shrink-0 self-start px-3 py-1.5 text-[11px] font-mono uppercase border border-[color:var(--color-ink)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors"
                  >
                    Source methods
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
