import ReviewerResponsePage from "@/app/methods/reviewer-responses/[id]/page";

export const dynamic = "force-dynamic";

export default async function ProjectReviewerResponsePage({
  params,
}: {
  params: Promise<{ responseId: string }>;
}) {
  const { responseId } = await params;
  return ReviewerResponsePage({ params: Promise.resolve({ id: responseId }) });
}
