import { getStudy } from "../studies";
import { listManuscripts } from "../manuscripts";
import { STUDY_MODE_INFO } from "@/lib/methodsLabels";
import { NO_INVENT_RULES, compileRecordedDesign } from "./promptParts";

// ===========================================================================
// Study drafting-prompts compiler. Turns a Methods study's recorded design into
// ready-to-use prompts for drafting the article's outline, introduction, and
// methodology. Lives beside "Create Article Draft" — the point at which study
// decisions become an article. Pure + deterministic; self-contained output that
// works in a browser chat or a CLI agent. Drafts from the recorded design only;
// never invents.
// ===========================================================================

export type DraftTask = "outline" | "introduction" | "methodology";

export interface StudyDraftContent {
  studyId: string;
  studyTitle: string;
  modeLabel: string;
  researchQuestion: string | null;
  /** Compiled protocol/SAP/data-dictionary/checklist, or null when nothing recorded. */
  recordedDesign: string | null;
  /** Current text of the linked article draft, when one already exists. */
  existingDraft: string | null;
}

export function compileStudyDraftingPrompts(studyId: string): StudyDraftContent {
  const study = getStudy(studyId);
  if (!study) throw new Error("study not found");

  const article = listManuscripts({ studyId })[0];

  return {
    studyId: study.id,
    studyTitle: study.title,
    modeLabel: STUDY_MODE_INFO[study.mode]?.label ?? study.mode,
    researchQuestion: study.research_question,
    recordedDesign: compileRecordedDesign(study),
    existingDraft: article?.content_md ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rendering: shared grounding body + per-output framing and task blocks.
// ---------------------------------------------------------------------------

const INTRO_LINE =
  "You are helping the author draft sections of a journal article from a study design they have already recorded. Work strictly from the material below.";

function groundingBody(c: StudyDraftContent): string {
  const parts: string[] = [
    "## Rules",
    NO_INVENT_RULES,
    "",
    "## Study",
    "",
    `Mode: ${c.modeLabel}`,
    c.researchQuestion ? `Research question: ${c.researchQuestion}` : "",
  ];
  if (c.recordedDesign) {
    parts.push(
      "",
      "## Recorded study design (the author's own decisions — draft from this; do not invent beyond it)",
      "",
      c.recordedDesign,
    );
  }
  if (c.existingDraft) {
    parts.push(
      "",
      "## Current draft (reconcile with what is already written; do not contradict it)",
      "",
      c.existingDraft.trim(),
    );
  }
  return parts.filter((p) => p !== "").join("\n");
}

const TASK_BLOCKS: Record<DraftTask, string> = {
  outline:
    "## Your task — OUTLINE\nDraft a section-by-section outline for the article, derived from the recorded study design and (when present) the reporting-guideline coverage. For each planned section, note in one line what it must contain.",
  introduction:
    "## Your task — INTRODUCTION\nDraft the Introduction as a motivated argument (problem → gap → this study's contribution), grounded in the research question and recorded design. Do not introduce new claims or citations; where a needed point is missing, flag it as a question for the author.",
  methodology:
    "## Your task — METHODOLOGY\nDraft the Methods section by assembling the recorded study design above (protocol / SAP / data dictionary) into prose, and cover the reporting-guideline items. State only what the recorded decisions support; flag anything still unspecified as a question for the author.",
};

const COMBINED_TASK = `## Your task
Draft the following three things, clearly separated under their own headings:

1. **Outline** — a section-by-section structure derived from the recorded design and guideline coverage.
2. **Introduction** — a motivated argument grounded in the research question and recorded design.
3. **Methodology** — the recorded study design assembled into prose, covering the reporting-guideline items.

End by listing, as explicit questions for the author, any information you needed but could not find in the material above.`;

export function renderCombined(c: StudyDraftContent): string {
  return [
    `# Drafting prompts — ${c.studyTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(c),
    "",
    COMBINED_TASK,
    "",
  ].join("\n");
}

export function renderTask(c: StudyDraftContent, task: DraftTask): string {
  return [
    `# Drafting prompt — ${c.studyTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(c),
    "",
    TASK_BLOCKS[task],
    "",
    "When done, list any information you needed but could not find above as explicit questions for the author.",
    "",
  ].join("\n");
}

export function renderAgentsMd(c: StudyDraftContent): string {
  return [
    "<!-- AGENTS.md — drafting prompts generated from a Methods study design.",
    "Agents that read this file automatically should treat it as the working brief",
    "for drafting this article's outline, introduction, and methodology. -->",
    "",
    renderCombined(c),
  ].join("\n");
}

export function renderDraftMd(c: StudyDraftContent): string {
  return renderCombined(c);
}
