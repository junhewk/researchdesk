import { redirect } from "next/navigation";
import { getStudy } from "@/server/studies";
import { PrismaPanel } from "@/components/methods/PrismaPanel";

export const dynamic = "force-dynamic";

export default async function PrismaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) redirect("/methods-workbench/studies");
  return <PrismaPanel study={study} />;
}
