import Link from "next/link";
import { ArrowLeft, FileText, FlaskConical, MessageSquareText, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectStageKey, ResearchProjectSummary } from "@/server/projects";

const STAGE_ICON: Record<ProjectStageKey, ReactNode> = {
  setup: <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />,
  harness: <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} />,
  article: <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />,
  review: <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.75} />,
};

const STATUS_CLASS = {
  ready: "border-[color:var(--color-secondary)] text-[color:var(--color-on-surface)]",
  needs_input: "border-[color:var(--color-tertiary)] text-[color:var(--color-on-surface)]",
  missing: "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]",
  unavailable: "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)] opacity-45",
};

export function ProjectStageNav({
  project,
  active,
}: {
  project: ResearchProjectSummary;
  active?: ProjectStageKey | "overview";
}) {
  const stages: ProjectStageKey[] = ["setup", "harness", "article", "review"];

  return (
    <header className="mb-8 border-b border-[color:var(--color-outline-variant)] pb-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Research Projects
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight text-[color:var(--color-on-surface)]">
            {project.title}
          </h1>
          {project.researchQuestion && (
            <p className="mt-1 max-w-3xl text-[13px] italic text-[color:var(--color-on-surface-variant)]">
              {project.researchQuestion}
            </p>
          )}
        </div>

        <nav aria-label="Project stages" className="flex flex-wrap gap-1.5">
          <Link
            href={project.links.overview}
            className={`rounded border px-3 py-1.5 text-[12px] transition-colors ${
              active === "overview"
                ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)]"
                : "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)]"
            }`}
          >
            Overview
          </Link>
          {stages.map((key) => {
            const stage = project.stages[key];
            const selected = active === key;
            const href = stage.href;
            const className = selected
              ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)]"
              : STATUS_CLASS[stage.status];
            const content = (
              <>
                {STAGE_ICON[key]}
                {stage.label}
              </>
            );
            return href ? (
              <Link
                key={key}
                href={href}
                title={stage.detail}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] transition-colors hover:border-[color:var(--color-outline)] ${className}`}
              >
                {content}
              </Link>
            ) : (
              <span
                key={key}
                title={stage.detail}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] ${className}`}
              >
                {content}
              </span>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
