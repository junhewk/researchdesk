import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  compileStudyDraftingPrompts,
  renderCombined,
  renderTask,
  renderFreeform,
  renderAgentsMd,
  renderDraftMd,
  defaultSections,
  ALL_TASKS,
  type DraftTask,
} from "@/server/methods/studyDraftingPrompts";
import { exportStudyDraftingPrompts } from "@/server/methods/studyExport";

// Compile drafting prompts from a study's recorded design (and screened corpus,
// for review modes), dual-write the AGENTS.md / drafting-prompts.md files, and
// return the prompt forms for the UI and the MCP server.
//
// Optional JSON body:
//   { sections?: DraftTask[];  // subset of outline/introduction/methodology/
//                              // results/discussion/abstract (default: per-mode)
//     task?: string }          // a freeform instruction to wrap with the grounding
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "study not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sections?: unknown;
    task?: unknown;
  };

  const requested = Array.isArray(body.sections)
    ? (body.sections.filter(
        (s): s is DraftTask => ALL_TASKS.includes(s as DraftTask),
      ) as DraftTask[])
    : null;

  const content = compileStudyDraftingPrompts(id);
  const sections =
    requested && requested.length > 0 ? requested : defaultSections(content.mode);
  const freeform =
    typeof body.task === "string" && body.task.trim() ? body.task : null;

  // Dual-write reflects the default per-mode brief, independent of the request.
  exportStudyDraftingPrompts(id, {
    agentsMd: renderAgentsMd(content),
    draftMd: renderDraftMd(content),
  });

  const taskPrompts: Partial<Record<DraftTask, string>> = {};
  for (const s of sections) taskPrompts[s] = renderTask(content, s);

  return NextResponse.json({
    sections,
    combinedPrompt: renderCombined(content, sections),
    taskPrompts,
    agentsMd: renderAgentsMd(content, sections),
    freeformPrompt: freeform ? renderFreeform(content, freeform) : null,
    hasDesign: content.recordedDesign != null,
    hasCorpus: content.corpusSummary != null,
  });
}
