import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  compileStudyDraftingPrompts,
  renderCombined,
  renderTask,
  renderAgentsMd,
  renderDraftMd,
} from "@/server/methods/studyDraftingPrompts";
import { exportStudyDraftingPrompts } from "@/server/methods/studyExport";

// Compile drafting prompts from a study's recorded design, dual-write the
// AGENTS.md / drafting-prompts.md files, and return the prompt forms for the UI.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "study not found" }, { status: 404 });
  }

  const content = compileStudyDraftingPrompts(id);
  exportStudyDraftingPrompts(id, {
    agentsMd: renderAgentsMd(content),
    draftMd: renderDraftMd(content),
  });

  return NextResponse.json({
    combinedPrompt: renderCombined(content),
    taskPrompts: {
      outline: renderTask(content, "outline"),
      introduction: renderTask(content, "introduction"),
      methodology: renderTask(content, "methodology"),
    },
    hasDesign: content.recordedDesign != null,
  });
}
