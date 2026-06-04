import Link from "next/link";
import { listManuscripts } from "@/server/manuscripts";
import { formatDate } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/styles";

export default function ManuscriptsPage() {
  const manuscripts = listManuscripts();

  return (
    <div className="reveal">
      <div className="flex items-baseline justify-between mb-12">
        <h1 className="font-display text-[42px] leading-none tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72, 'wght' 400" }}>
          My articles
        </h1>
        <Link
          href="/my-articles/new"
          className="text-[13px] text-[color:var(--color-ink)] hover:text-[color:var(--color-redink)]"
        >
          + New article
        </Link>
      </div>

      {manuscripts.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display italic text-[20px] text-[color:var(--color-sepia)]">
            No articles yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--color-rule)] border-t border-[color:var(--color-rule)]">
          {manuscripts.map((m) => (
            <li key={m.id}>
              <Link href={`/my-articles/${m.id}`} className="block py-5 group">
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
