import Link from "next/link";
import { Archive, ArrowRight, FileText, FlaskConical } from "lucide-react";
import {
  listResearchProjects,
  type ResearchProjectSummary,
} from "@/server/projects";
import { STUDY_MODE_INFO } from "@/lib/methodsLabels";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function archiveReason(project: ResearchProjectSummary): string {
  if (project.studyStatus === "archived" && project.manuscriptStatus === "completed") {
    return "Archived setup and completed article";
  }
  if (project.studyStatus === "archived") return "Archived setup";
  return "Completed article";
}

function modeLabel(project: ResearchProjectSummary): string {
  if (!project.mode) return "Article-only";
  return STUDY_MODE_INFO[project.mode]?.label ?? project.mode;
}

function ArchiveRow({
  project,
  now,
}: {
  project: ResearchProjectSummary;
  now: number;
}) {
  const hasStudy = Boolean(project.studyId);

  return (
    <li>
      <Link
        href={project.links.overview}
        className="group grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
      >
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-on-surface-variant)]">
            <span className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-2 py-0.5 font-mono uppercase">
              {hasStudy ? (
                <FlaskConical className="h-3 w-3" strokeWidth={1.75} />
              ) : (
                <FileText className="h-3 w-3" strokeWidth={1.75} />
              )}
              {modeLabel(project)}
            </span>
            <span>{archiveReason(project)}</span>
          </div>
          <h2 className="font-display text-[22px] leading-tight text-[color:var(--color-on-surface)] transition-colors group-hover:text-[color:var(--color-primary)]">
            {project.title}
          </h2>
          {project.researchQuestion && (
            <p className="mt-1 max-w-3xl text-[12px] italic text-[color:var(--color-on-surface-variant)]">
              {project.researchQuestion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 text-[12px] text-[color:var(--color-on-surface-variant)] lg:justify-end">
          <span>Updated {relativeTime(project.updatedAt, now)}</span>
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </div>
      </Link>
    </li>
  );
}

export default function ArchivesPage() {
  const projects = listResearchProjects({ limit: 500 }).filter(
    (project) =>
      project.studyStatus === "archived" ||
      project.manuscriptStatus === "completed",
  );
  // Server Component: this renders once per request, so Date.now() is the
  // request-time value for relative labels.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="reveal mx-auto max-w-[1180px]">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-display text-[42px] font-semibold leading-none tracking-tight text-[color:var(--color-on-surface)]">
            <Archive
              className="h-8 w-8 text-[color:var(--color-on-surface-variant)]"
              strokeWidth={1.75}
            />
            Archives
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--color-on-surface-variant)]">
            Completed articles and archived research setups stay here for reference.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] px-4 py-2.5 text-[14px] font-medium text-[color:var(--color-on-surface)] transition-colors hover:border-[color:var(--color-outline)] hover:bg-[color:var(--color-surface-container-low)]"
        >
          Open projects
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      </header>

      {projects.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[color:var(--color-outline-variant)] py-16 text-center">
          <p className="font-display text-[20px] italic text-[color:var(--color-on-surface-variant)]">
            Nothing archived yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--color-on-surface-variant)]">
            Projects appear here after a setup is archived or an article is marked completed.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-[color:var(--color-outline-variant)] border-y border-[color:var(--color-outline-variant)]">
          {projects.map((project) => (
            <ArchiveRow key={project.id} project={project} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
