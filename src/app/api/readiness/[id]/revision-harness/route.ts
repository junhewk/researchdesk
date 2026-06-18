import { NextRequest, NextResponse } from "next/server";
import { getReadinessCheck } from "@/server/readinessChecks";
import {
  compileRevisionHarness,
  renderHarnessPrompt,
  renderFindingPrompt,
  renderAgentsMd,
  renderHarnessMd,
} from "@/server/methods/revisionHarness";
import { exportRevisionHarness } from "@/server/markdownExport";

// Compile the revision harness from a reconciled readiness check, dual-write the
// AGENTS.md / revision-harness.md files, and return the prompt forms for the UI.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }

  const content = compileRevisionHarness(id);
  exportRevisionHarness(content.manuscriptId, {
    agentsMd: renderAgentsMd(content),
    harnessMd: renderHarnessMd(content),
  });

  return NextResponse.json({
    harnessPrompt: renderHarnessPrompt(content),
    findingPrompts: content.findings.map((f) => ({
      gateLabel: f.gateLabel,
      prompt: renderFindingPrompt(content, f),
    })),
    openCount: content.openCount,
  });
}
