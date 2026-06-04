import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReviewerResponse,
  listResponseItems,
} from "@/server/reviewerResponses";
import { getManuscript } from "@/server/manuscripts";
import { formatDate } from "@/lib/utils";
import { ReviewerResponseEditor } from "./ReviewerResponseEditor";

export const dynamic = "force-dynamic";

export default async function ReviewerResponsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = getReviewerResponse(id);
  if (!response) notFound();
  const manuscript = getManuscript(response.manuscript_id);
  const items = listResponseItems(id);

  return (
    <div className="reveal mx-auto max-w-4xl">
      <Link
        href={
          manuscript
            ? `/my-articles/${manuscript.id}/workspace`
            : "/methods-workbench"
        }
        className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        &larr; {manuscript?.title ?? "Methods Workbench"}
      </Link>

      <header className="mt-3 mb-6">
        <h1
          className="font-display text-[32px] leading-tight tracking-tight"
          style={{ letterSpacing: "-0.01em" }}
        >
          Response to reviewers · Round {response.round}
        </h1>
        <p className="mt-2 text-[12px] font-mono tabular text-[color:var(--color-on-surface-variant)]">
          {[
            `status: ${response.status}`,
            `items: ${items.length}`,
            `started ${formatDate(response.created_at)}`,
            response.compiled_asset_id ? `compiled` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>

      <ReviewerResponseEditor
        responseId={id}
        items={items}
        compiled={Boolean(response.compiled_asset_id)}
        manuscriptId={response.manuscript_id}
      />
    </div>
  );
}
