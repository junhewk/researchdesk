import { NextRequest, NextResponse } from "next/server";
import { getReadinessCheck } from "@/server/readinessChecks";
import {
  compileDraftingBrief,
  renderAgentsMd,
  renderBriefMd,
} from "@/server/methods/draftingBrief";

// Stream the drafting brief as a downloadable file: AGENTS.md (?format=agents)
// for CLI agents, or drafting-brief.md (default) to attach/upload anywhere.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const content = compileDraftingBrief(id);

  const [body, filename] =
    format === "agents"
      ? [renderAgentsMd(content), "AGENTS.md"]
      : [renderBriefMd(content), "drafting-brief.md"];

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
