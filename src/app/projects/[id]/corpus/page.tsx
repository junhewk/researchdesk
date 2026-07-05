import { redirect } from "next/navigation";
import { ScreeningWorkspace } from "@/components/methods/ScreeningWorkspace";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectCorpusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.corpus ?? project.links.overview);
  if (!project.study || project.study.mode !== "scoping_review") {
    redirect(project.links.setup ?? project.links.overview);
  }
  return <ScreeningWorkspace study={project.study} />;
}
