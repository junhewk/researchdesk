import { redirect } from "next/navigation";
import { PrismaPanel } from "@/components/methods/PrismaPanel";
import { getResearchProject } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPrismaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getResearchProject(id);
  if (!project) redirect("/projects");
  if (project.id !== id) redirect(project.links.prisma ?? project.links.overview);
  if (!project.study || project.study.mode !== "scoping_review") {
    redirect(project.links.setup ?? project.links.overview);
  }
  return <PrismaPanel study={project.study} />;
}
