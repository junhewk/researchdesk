import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import { readStudyDraftingPrompts } from "@/server/methods/studyExport";

// Stream the latest agent-generated drafting harness. There is no deterministic
// prompt fallback here; callers must generate with the agent first.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "study not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const files = readStudyDraftingPrompts(id);

  const [body, filename] =
    format === "agents"
      ? [files.agentsMd, "AGENTS.md"]
      : [files.draftMd, "drafting-prompts.md"];

  if (!body) {
    return NextResponse.json(
      { error: "no generated article harness yet; generate with an AI provider first" },
      { status: 404 },
    );
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
