import { redirect } from "next/navigation";
import { getStudy } from "@/server/studies";
import { ScreeningWorkspace } from "@/components/methods/ScreeningWorkspace";

export const dynamic = "force-dynamic";

export default async function CorpusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) redirect("/projects");
  return <ScreeningWorkspace study={study} />;
}
