import { redirect } from "next/navigation";
import { ManuscriptWorkspace } from "@/app/my-articles/[id]/workspace/page";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.review ?? project.links.overview);
  if (!project.manuscript) redirect(project.links.article ?? project.links.overview);

  return (
    <ManuscriptWorkspace
      manuscriptId={project.manuscript.id}
      projectId={project.id}
      defaultCenter="peer"
    />
  );
}
