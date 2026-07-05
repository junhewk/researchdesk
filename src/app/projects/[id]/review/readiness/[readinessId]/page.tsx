import ReadinessCheckPage from "@/app/methods/readiness/[id]/page";

export const dynamic = "force-dynamic";

export default async function ProjectReadinessCheckPage({
  params,
}: {
  params: Promise<{ readinessId: string }>;
}) {
  const { readinessId } = await params;
  return ReadinessCheckPage({ params: Promise.resolve({ id: readinessId }) });
}
