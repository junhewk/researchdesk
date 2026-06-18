import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  compileStudyDraftingPrompts,
  renderAgentsMd,
  renderDraftMd,
} from "@/server/methods/studyDraftingPrompts";

// Stream the drafting prompts as a downloadable file: AGENTS.md (?format=agents)
// for CLI agents, or drafting-prompts.md (default) to attach/upload anywhere.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "study not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const content = compileStudyDraftingPrompts(id);

  const [body, filename] =
    format === "agents"
      ? [renderAgentsMd(content), "AGENTS.md"]
      : [renderDraftMd(content), "drafting-prompts.md"];

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
