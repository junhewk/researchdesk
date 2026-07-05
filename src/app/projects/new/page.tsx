import Link from "next/link";
import { ArrowRight, FileText, FlaskConical } from "lucide-react";

export default function NewProjectPage() {
  return (
    <div className="reveal mx-auto max-w-3xl">
      <Link
        href="/projects"
        className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        &larr; Research Projects
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="font-display text-[38px] font-semibold leading-tight tracking-tight text-[color:var(--color-on-surface)]">
          New Research Project
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--color-on-surface-variant)]">
          Start from research setup when you are still designing the work, or
          start from article text when the manuscript already exists.
        </p>
      </header>

      <div className="grid gap-4">
        <Link
          href="/projects/new/setup"
          className="group rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-5 transition-colors hover:border-[color:var(--color-outline)]"
        >
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)]">
              <FlaskConical className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[20px] font-semibold text-[color:var(--color-on-surface)]">
                Start with research setup
              </h2>
              <p className="mt-1 text-[13px] text-[color:var(--color-on-surface-variant)]">
                Capture the research question, study type, evidence, and design
                decisions before generating the article-writing harness.
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--color-on-surface-variant)] transition-colors group-hover:text-[color:var(--color-primary)]" strokeWidth={1.75} />
          </div>
        </Link>

        <Link
          href="/projects/new/article"
          className="group rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-5 transition-colors hover:border-[color:var(--color-outline)]"
        >
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[color:var(--color-surface-container)] text-[color:var(--color-on-surface)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[20px] font-semibold text-[color:var(--color-on-surface)]">
                Start with a written article
              </h2>
              <p className="mt-1 text-[13px] text-[color:var(--color-on-surface-variant)]">
                Upload article text and review context directly. Setup and
                harness stages remain unavailable for article-only projects.
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--color-on-surface-variant)] transition-colors group-hover:text-[color:var(--color-primary)]" strokeWidth={1.75} />
          </div>
        </Link>
      </div>
    </div>
  );
}
