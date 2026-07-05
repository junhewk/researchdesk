import Link from "next/link";
import { ArrowRight, FileText, FlaskConical, MessageSquareText, PenLine, Plus } from "lucide-react";
import { listResearchProjects, type ProjectStageStatus, type ResearchProjectSummary } from "@/server/projects";
import { STUDY_MODE_INFO } from "@/lib/methodsLabels";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_DOT: Record<ProjectStageStatus, string> = {
  ready: "bg-[color:var(--color-secondary)]",
  needs_input: "bg-[color:var(--color-tertiary)]",
  missing: "bg-[color:var(--color-outline-variant)]",
  unavailable: "bg-transparent border border-[color:var(--color-outline-variant)]",
};

function stageIcon(key: string) {
  switch (key) {
    case "setup":
      return <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />;
    case "harness":
      return <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} />;
    case "review":
      return <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.75} />;
    default:
      return <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />;
  }
}

function ProjectRow({ project, now }: { project: ResearchProjectSummary; now: number }) {
  const stageKeys = ["setup", "harness", "article", "review"] as const;
  const modeLabel = project.mode
    ? STUDY_MODE_INFO[project.mode]?.label ?? project.mode
    : "Article-only";

  return (
    <li>
      <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <Link href={project.links.overview} className="group min-w-0">
          <h2 className="font-display text-[22px] leading-tight text-[color:var(--color-on-surface)] transition-colors group-hover:text-[color:var(--color-primary)]">
            {project.title}
          </h2>
          {project.researchQuestion && (
            <p className="mt-1 max-w-3xl text-[12px] italic text-[color:var(--color-on-surface-variant)]">
              {project.researchQuestion}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-on-surface-variant)]">
            <span className="font-mono uppercase">{modeLabel}</span>
            {project.manuscriptStatus && (
              <span className="font-mono uppercase">
                {project.manuscriptStatus.replace("_", " ")}
              </span>
            )}
            <span>Updated {relativeTime(project.updatedAt, now)}</span>
          </div>
        </Link>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            {stageKeys.map((key) => {
              const stage = project.stages[key];
              return (
                <span
                  key={key}
                  title={stage.detail}
                  className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-2.5 py-1 text-[11px] text-[color:var(--color-on-surface-variant)]"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[stage.status]}`} />
                  {stageIcon(key)}
                  {stage.label}
                </span>
              );
            })}
          </div>
          <Link
            href={project.nextActionHref}
            className="inline-flex items-center gap-1.5 self-start rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] transition-colors hover:bg-[color:var(--color-primary-container)] lg:self-auto"
          >
            {project.nextActionLabel}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function ProjectsPage() {
  const projects = listResearchProjects({ limit: 200 });
  // Server Component: this renders once per request, so Date.now() is the
  // request-time value for relative labels.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="reveal mx-auto max-w-[1180px]">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[42px] font-semibold leading-none tracking-tight text-[color:var(--color-on-surface)]">
            Research Projects
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--color-on-surface-variant)]">
            Manage setup, article-writing harnesses, written articles, and
            review work from one project list.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded bg-[color:var(--color-primary)] px-4 py-2.5 text-[14px] font-medium text-[color:var(--color-on-primary)] transition-colors hover:bg-[color:var(--color-primary-container)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New Research Project
        </Link>
      </header>

      {projects.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[color:var(--color-outline-variant)] py-16 text-center">
          <p className="font-display text-[20px] italic text-[color:var(--color-on-surface-variant)]">
            No research projects yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--color-on-surface-variant)]">
            Start with research setup when the work is still being designed, or
            start with a written article when the manuscript already exists.
          </p>
          <Link
            href="/projects/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded bg-[color:var(--color-primary)] px-4 py-2 text-[13px] font-medium text-[color:var(--color-on-primary)]"
          >
            Create a project
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </section>
      ) : (
        <ul className="divide-y divide-[color:var(--color-outline-variant)] border-y border-[color:var(--color-outline-variant)]">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
