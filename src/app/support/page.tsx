import Link from "next/link";
import { Database, ExternalLink, HelpCircle, Settings } from "lucide-react";
import { resolveDataDir } from "@/lib/dataDir";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  const dataDir = resolveDataDir();

  return (
    <div className="reveal mx-auto max-w-[920px]">
      <header className="mb-10">
        <h1 className="flex items-center gap-3 font-display text-[42px] font-semibold leading-none tracking-tight text-[color:var(--color-on-surface)]">
          <HelpCircle
            className="h-8 w-8 text-[color:var(--color-on-surface-variant)]"
            strokeWidth={1.75}
          />
          Support
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--color-on-surface-variant)]">
          Diagnostics and project links for this local ResearchDesk installation.
        </p>
      </header>

      <div className="divide-y divide-[color:var(--color-outline-variant)] border-y border-[color:var(--color-outline-variant)]">
        <section className="grid gap-3 py-5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--color-on-surface)]">
            <Database className="h-4 w-4" strokeWidth={1.75} />
            App data
          </div>
          <div className="min-w-0">
            <p className="break-all font-mono text-[12px] text-[color:var(--color-on-surface-variant)]">
              {dataDir}
            </p>
          </div>
        </section>

        <section className="grid gap-3 py-5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--color-on-surface)]">
            <Settings className="h-4 w-4" strokeWidth={1.75} />
            Configuration
          </div>
          <div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--color-on-surface)] transition-colors hover:border-[color:var(--color-outline)] hover:bg-[color:var(--color-surface-container-low)]"
            >
              Open settings
            </Link>
          </div>
        </section>

        <section className="grid gap-3 py-5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--color-on-surface)]">
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
            Repository
          </div>
          <div>
            <a
              href="https://github.com/junhewk/researchdesk/issues"
              className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--color-on-surface)] transition-colors hover:border-[color:var(--color-outline)] hover:bg-[color:var(--color-surface-container-low)]"
            >
              Open issues
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
