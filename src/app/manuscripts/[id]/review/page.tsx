import { redirect } from "next/navigation";

export default async function LegacyReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/my-articles/${id}/workspace?center=findings`);
}
