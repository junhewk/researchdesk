import { redirect } from "next/navigation";
import { getStudy } from "@/server/studies";
import { StudyWorkspace } from "@/components/methods/StudyWorkspace";

export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) redirect("/methods-workbench/studies");
  return <StudyWorkspace studyId={id} initialStudy={study} />;
}
