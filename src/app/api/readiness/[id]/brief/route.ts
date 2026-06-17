import { NextRequest, NextResponse } from "next/server";
import { getReadinessCheck } from "@/server/readinessChecks";
import {
  compileDraftingBrief,
  renderCombinedPrompt,
  renderTaskPrompt,
  renderAgentsMd,
  renderBriefMd,
} from "@/server/methods/draftingBrief";
import { exportDraftingBrief } from "@/server/markdownExport";

// Compile the drafting brief from a reconciled readiness check, dual-write the
// AGENTS.md / drafting-brief.md files, and return the prompt forms for the UI.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }

  const content = compileDraftingBrief(id);
  exportDraftingBrief(content.manuscriptId, {
    agentsMd: renderAgentsMd(content),
    briefMd: renderBriefMd(content),
  });

  return NextResponse.json({
    combinedPrompt: renderCombinedPrompt(content),
    taskPrompts: {
      outline: renderTaskPrompt(content, "outline"),
      introduction: renderTaskPrompt(content, "introduction"),
      methodology: renderTaskPrompt(content, "methodology"),
    },
    openCount: content.openCount,
    hasStudy: content.recordedDesign != null,
  });
}
