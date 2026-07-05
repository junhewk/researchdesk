import { redirect } from "next/navigation";
import { ProjectArticleStartPanel } from "@/components/projects/ProjectArticleStartPanel";
import { ProjectStageNav } from "@/components/projects/ProjectStageNav";
import { ManuscriptWorkspace } from "@/app/my-articles/[id]/workspace/page";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.article ?? project.links.overview);

  if (!project.manuscript) {
    if (!project.study) redirect(project.links.overview);
    return (
      <div className="reveal mx-auto max-w-4xl">
        <ProjectStageNav project={project} active="article" />
        <ProjectArticleStartPanel studyId={project.study.id} />
      </div>
    );
  }

  return (
    <ManuscriptWorkspace
      manuscriptId={project.manuscript.id}
      projectId={project.id}
    />
  );
}
