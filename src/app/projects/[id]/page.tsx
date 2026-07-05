import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ProjectStageNav } from "@/components/projects/ProjectStageNav";
import { getResearchProject, type ProjectStageKey, type ProjectStageStatus } from "@/server/projects";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ProjectStageStatus, string> = {
  ready: "Ready",
  needs_input: "Needs input",
  missing: "Missing",
  unavailable: "Unavailable",
};

const STATUS_CLASS: Record<ProjectStageStatus, string> = {
  ready: "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]",
  needs_input: "bg-[color:var(--color-tertiary-container)] text-[color:var(--color-on-tertiary-container)]",
  missing: "bg-[color:var(--color-surface-container)] text-[color:var(--color-on-surface-variant)]",
  unavailable: "bg-[color:var(--color-surface-container)] text-[color:var(--color-on-surface-variant)] opacity-60",
};

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.overview);

  const stageKeys: ProjectStageKey[] = ["setup", "harness", "article", "review"];

  return (
    <div className="reveal mx-auto max-w-[1080px]">
      <ProjectStageNav project={project} active="overview" />

      <section className="mb-8 rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[18px] font-semibold text-[color:var(--color-on-surface)]">
              Next action
            </h2>
            <p className="mt-1 text-[13px] text-[color:var(--color-on-surface-variant)]">
              Continue from the first project stage that needs attention.
            </p>
          </div>
          <Link
            href={project.nextActionHref}
            className="inline-flex items-center gap-1.5 self-start rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] transition-colors hover:bg-[color:var(--color-primary-container)] sm:self-auto"
          >
            {project.nextActionLabel}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </section>

      <section>
        <h2 className="label mb-3">Stages</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {stageKeys.map((key) => {
            const stage = project.stages[key];
            const inner = (
              <div className="h-full rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-4 transition-colors hover:border-[color:var(--color-outline)]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[17px] font-semibold text-[color:var(--color-on-surface)]">
                    {stage.label}
                  </h3>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${STATUS_CLASS[stage.status]}`}>
                    {STATUS_LABEL[stage.status]}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-[color:var(--color-on-surface-variant)]">
                  {stage.detail}
                </p>
              </div>
            );
            return stage.href ? (
              <Link key={key} href={stage.href}>
                {inner}
              </Link>
            ) : (
              <div key={key}>{inner}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
