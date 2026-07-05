import { getStudy } from "../studies";
import { listManuscripts } from "../manuscripts";
import { STUDY_MODE_INFO } from "@/lib/methodsLabels";
import { NO_INVENT_RULES, compileRecordedDesign } from "./promptParts";
import {
  recordStats,
  renderPrismaMarkdown,
  renderCharacteristics,
} from "./reviewCorpus";
import type { StudyMode } from "../types";

// ===========================================================================
// Study drafting-prompts compiler. Turns a Methods study's recorded design into
// ready-to-use prompts for drafting the article's sections: outline,
// introduction, methodology, results, discussion, and abstract. This is the
// primary point where study decisions become article-review drafting material,
// and it is also exposed to CLI agents through the MCP server. Pure +
// deterministic; self-contained output
// that works in a browser chat or a CLI agent. Drafts from the recorded design
// (and, for review modes, the screened corpus) only; never invents.
// ===========================================================================

export type DraftTask =
  | "outline"
  | "introduction"
  | "methodology"
  | "results"
  | "discussion"
  | "abstract";

export const ALL_TASKS: DraftTask[] = [
  "outline",
  "introduction",
  "methodology",
  "results",
  "discussion",
  "abstract",
];

/** Modes whose Results/Discussion are grounded in a screened literature corpus. */
const REVIEW_MODES = new Set<StudyMode>(["scoping_review", "systematic_review"]);

/** The default section set offered for a mode (abstract stays opt-in). */
export function defaultSections(mode: StudyMode): DraftTask[] {
  return REVIEW_MODES.has(mode)
    ? ["outline", "introduction", "methodology", "results", "discussion"]
    : ["outline", "introduction", "methodology"];
}

export interface StudyDraftContent {
  studyId: string;
  studyTitle: string;
  mode: StudyMode;
  modeLabel: string;
  researchQuestion: string | null;
  /** Compiled protocol/SAP/data-dictionary/checklist, or null when nothing recorded. */
  recordedDesign: string | null;
  /** PRISMA flow + characteristics + screening counts, when a corpus exists. */
  corpusSummary: string | null;
  /** Current text of the linked article draft, when one already exists. */
  existingDraft: string | null;
}

export interface ArticleHarnessOutput {
  summaryMd: string;
  combinedPrompt: string;
  taskPrompts: Partial<Record<DraftTask, string>>;
  freeformPrompt: string | null;
  qualityWarnings: string[];
  unresolvedQuestions: string[];
  methodology: string;
}

/** Assemble the screened-corpus grounding (PRISMA flow + characteristics +
 * one-line counts) for review modes, or null when the study has no records. */
function compileCorpusSummary(studyId: string): string | null {
  const stats = recordStats(studyId);
  if (stats.total === 0) return null;
  const counts =
    `Screening counts — total ${stats.total}: ` +
    `include ${stats.include}, exclude ${stats.exclude}, maybe ${stats.maybe}, ` +
    `unscreened ${stats.unscreened} (confirmed ${stats.confirmed}, needs review ${stats.needs_review}).`;
  return [
    counts,
    "",
    renderPrismaMarkdown(studyId).trim(),
    "",
    "### Characteristics of included sources",
    "",
    renderCharacteristics(studyId, "md").trim(),
  ].join("\n");
}

export function compileStudyDraftingPrompts(studyId: string): StudyDraftContent {
  const study = getStudy(studyId);
  if (!study) throw new Error("study not found");

  const article = listManuscripts({ studyId })[0];

  return {
    studyId: study.id,
    studyTitle: study.title,
    mode: study.mode,
    modeLabel: STUDY_MODE_INFO[study.mode]?.label ?? study.mode,
    researchQuestion: study.research_question,
    recordedDesign: compileRecordedDesign(study),
    corpusSummary: compileCorpusSummary(study.id),
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
  if (c.corpusSummary) {
    parts.push(
      "",
      "## Screened corpus & PRISMA flow (the author's own screening — cite these counts/sources; do not invent findings)",
      "",
      c.corpusSummary,
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

/** Deterministic grounding pack for the article-writing harness agent. This is
 * facts and constraints only; user-facing prompt text must come from the
 * structured agent pass, not from this aggregate context. */
export function renderGroundingPack(c: StudyDraftContent): string {
  return [
    `# Article-writing grounding pack — ${c.studyTitle}`,
    "",
    "This pack is deterministic. Use it as source material only.",
    "",
    groundingBody(c),
  ].join("\n");
}

const TASK_BLOCKS: Record<DraftTask, string> = {
  outline:
    "## Your task — OUTLINE\nDraft a section-by-section outline for the article, derived from the recorded study design and (when present) the reporting-guideline coverage. For each planned section, note in one line what it must contain.",
  introduction:
    "## Your task — INTRODUCTION\nDraft the Introduction as a motivated argument (problem → gap → this study's contribution), grounded in the research question and recorded design. Do not introduce new claims or citations; where a needed point is missing, flag it as a question for the author.",
  methodology:
    "## Your task — METHODOLOGY\nDraft the Methods section by assembling the recorded study design above (protocol / SAP / data dictionary) into prose, and cover the reporting-guideline items. State only what the recorded decisions support; flag anything still unspecified as a question for the author.",
  results:
    "## Your task — RESULTS\nDraft the Results section descriptively from the screened corpus above: (1) study selection — narrate the PRISMA flow and cite its exact counts; (2) characteristics of included sources — summarise the characteristics table; (3) synthesis — organise the included sources by the charted concepts. Report ONLY the recorded counts and charted fields; do not invent findings, effect sizes, or sources not present above. Where a number or charted field is missing, flag it as a question for the author.",
  discussion:
    "## Your task — DISCUSSION (outline/brief)\nDraft a Discussion *outline*, not finished interpretive prose: (1) summary of the evidence as charted; (2) how it answers the research question; (3) gaps and limitations that follow from the recorded design and screening. Mark every interpretive claim or implication as an explicit question for the author to decide — never assert an interpretation the recorded material does not directly support.",
  abstract:
    "## Your task — ABSTRACT\nDraft a structured abstract (background / objective / methods / results / conclusion) assembled ONLY from the recorded design and screened corpus above. Use the recorded research question and PRISMA counts; flag any element you cannot ground as a question for the author.",
};

const TASK_SUMMARY: Record<DraftTask, string> = {
  outline:
    "**Outline** — a section-by-section structure derived from the recorded design and guideline coverage.",
  introduction:
    "**Introduction** — a motivated argument grounded in the research question and recorded design.",
  methodology:
    "**Methodology** — the recorded study design assembled into prose, covering the reporting-guideline items.",
  results:
    "**Results** — study selection (with the PRISMA counts), the characteristics-of-sources table, and the synthesis of charted concepts; recorded counts/fields only.",
  discussion:
    "**Discussion** — an outline (summary of evidence → relation to the question → limitations), flagging every interpretive claim as a question for the author.",
  abstract:
    "**Abstract** — a structured abstract assembled only from the recorded design and corpus.",
};

function combinedTaskBlock(tasks: DraftTask[]): string {
  const items = tasks
    .map((t, i) => `${i + 1}. ${TASK_SUMMARY[t]}`)
    .join("\n");
  return [
    "## Your task",
    "Draft the following, clearly separated under their own headings:",
    "",
    items,
    "",
    "End by listing, as explicit questions for the author, any information you needed but could not find in the material above.",
  ].join("\n");
}

export function renderCombined(
  c: StudyDraftContent,
  tasks: DraftTask[] = defaultSections(c.mode),
): string {
  return [
    `# Drafting prompts — ${c.studyTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(c),
    "",
    combinedTaskBlock(tasks),
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

/** Wrap the grounded body around an arbitrary author/agent-supplied task. */
export function renderFreeform(c: StudyDraftContent, instruction: string): string {
  return [
    `# Drafting prompt — ${c.studyTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(c),
    "",
    "## Your task",
    instruction.trim(),
    "",
    "When done, list any information you needed but could not find above as explicit questions for the author.",
    "",
  ].join("\n");
}

export function renderAgentsMd(
  c: StudyDraftContent,
  tasks: DraftTask[] = defaultSections(c.mode),
): string {
  return [
    "<!-- AGENTS.md — drafting prompts generated from a Methods study design.",
    "Agents that read this file automatically should treat it as the working brief",
    "for drafting this article's sections from the recorded design only. -->",
    "",
    renderCombined(c, tasks),
  ].join("\n");
}

export function renderDraftMd(c: StudyDraftContent): string {
  return renderCombined(c);
}

export function renderGeneratedAgentsMd(
  c: StudyDraftContent,
  harness: ArticleHarnessOutput,
): string {
  return [
    "<!-- AGENTS.md — agent-generated article-writing harness.",
    "The deterministic app layer supplied the grounding pack and validated this",
    "structured output. Draft from the supplied material only. -->",
    "",
    `# Article-writing harness — ${c.studyTitle}`,
    "",
    `Methodology: ${harness.methodology}`,
    "",
    harness.combinedPrompt.trim(),
    harness.qualityWarnings.length > 0 ? "\n## Quality warnings\n" : "",
    ...harness.qualityWarnings.map((w) => `- ${w}`),
    harness.unresolvedQuestions.length > 0 ? "\n## Questions for the author\n" : "",
    ...harness.unresolvedQuestions.map((q) => `- ${q}`),
    "",
  ].filter((part) => part !== "").join("\n");
}

export function renderGeneratedDraftMd(
  c: StudyDraftContent,
  harness: ArticleHarnessOutput,
): string {
  const sectionPrompts = ALL_TASKS
    .filter((task) => harness.taskPrompts[task])
    .map((task) => [`## ${TASK_SUMMARY[task]}`, "", harness.taskPrompts[task]!.trim()].join("\n"))
    .join("\n\n---\n\n");
  return [
    `# Article-writing harness — ${c.studyTitle}`,
    "",
    harness.summaryMd.trim(),
    "",
    "## Full prompt",
    "",
    harness.combinedPrompt.trim(),
    sectionPrompts ? "\n---\n\n# Per-section prompts\n" : "",
    sectionPrompts,
    "",
  ].filter((part) => part !== "").join("\n");
}
