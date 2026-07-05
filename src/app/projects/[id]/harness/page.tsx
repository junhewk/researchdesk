import { redirect } from "next/navigation";
import { ProjectHarnessClient } from "@/components/projects/ProjectHarnessClient";
import { ProjectStageNav } from "@/components/projects/ProjectStageNav";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectHarnessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.harness ?? project.links.overview);
  if (!project.study) redirect(project.links.overview);

  return (
    <div className="reveal mx-auto max-w-4xl">
      <ProjectStageNav project={project} active="harness" />
      <ProjectHarnessClient
        studyId={project.study.id}
        localOnly={project.study.confidentiality_mode === "local_only"}
      />
    </div>
  );
}
