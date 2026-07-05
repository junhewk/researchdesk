import { redirect } from "next/navigation";
import { StudyWorkspace } from "@/components/methods/StudyWorkspace";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.setup ?? project.links.overview);
  if (!project.study) redirect(project.links.article ?? project.links.overview);
  return <StudyWorkspace studyId={project.study.id} initialStudy={project.study} />;
}
