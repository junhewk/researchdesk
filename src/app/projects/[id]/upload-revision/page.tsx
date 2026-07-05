import { redirect } from "next/navigation";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectUploadRevisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(`/projects/${project.id}/upload-revision`);
  if (!project.manuscript) redirect(project.links.article ?? project.links.overview);
  redirect(`/my-articles/${project.manuscript.id}/upload-revision`);
}
