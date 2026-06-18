import { NextRequest, NextResponse } from "next/server";
import { getReadinessCheck } from "@/server/readinessChecks";
import {
  compileRevisionHarness,
  renderAgentsMd,
  renderHarnessMd,
} from "@/server/methods/revisionHarness";

// Stream the revision harness as a downloadable file: AGENTS.md (?format=agents)
// for CLI agents, or revision-harness.md (default) to attach/upload anywhere.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const content = compileRevisionHarness(id);

  const [body, filename] =
    format === "agents"
      ? [renderAgentsMd(content), "AGENTS.md"]
      : [renderHarnessMd(content), "revision-harness.md"];

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
