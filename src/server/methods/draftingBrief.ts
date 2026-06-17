import { getReadinessCheck, listReadinessItems } from "../readinessChecks";
import { getManuscript } from "../manuscripts";
import { getStudy, listDecisions, getOrCreateArtifact } from "../studies";
import { compileArtifact, renderArtifactMarkdown } from "./artifacts";
import { gateInfo, READINESS_SEVERITY_INFO } from "@/lib/methodsLabels";
import type { ReadinessCheckItem, Study, StudyArtifactKind } from "../types";

// ===========================================================================
// Drafting Brief compiler. Turns a reconciled readiness check into ready-to-use
// drafting prompts the user can paste into ANY AI (browser chat or CLI agent).
//
// Pure + deterministic — no network, no LLM call. Every output is compiled only
// from first-party material: the user's manuscript text, the readiness findings
// they accepted, and the study-design decisions they already recorded. Each
// rendered prompt is self-contained (grounding inlined) and instructs the AI to
// assemble/reconcile existing material, never invent — per the project's hard
// rule that the agent generates no novel research content.
// ===========================================================================

// Methodology rests on these recorded-design artifacts, in this order.
const DESIGN_ARTIFACT_KINDS: StudyArtifactKind[] = [
  "protocol",
  "sap",
  "data_dictionary",
  "checklist_map",
];

export type DraftTask = "outline" | "introduction" | "methodology";

interface BriefGap {
  gateLabel: string;
  severity: string | null;
  finding: string;
  fix: string | null;
}

export interface BriefContent {
  manuscriptId: string;
  manuscriptTitle: string;
  meta: string;
  manuscriptText: string;
  acceptedGaps: BriefGap[];
  /** Count of readiness items still `open` (not yet accepted or dismissed). */
  openCount: number;
  /** Compiled protocol/SAP/data-dictionary/checklist markdown, or null when no study is linked. */
  recordedDesign: string | null;
}

const RULES = `## Rules
- Use ONLY the material provided below. Do NOT invent findings, data, citations, numbers, or claims that are not already present.
- Reconcile and organize the author's existing claims. Where something needed is missing, list it as an explicit question for the author rather than fabricating it.
- Preserve the author's voice, terminology, and the manuscript's existing structure.`;

function manuscriptMeta(m: {
  research_domain: string | null;
  research_type: string | null;
  journal_type: string | null;
}): string {
  return [
    m.research_domain && `Domain: ${m.research_domain}`,
    m.research_type && `Research type: ${m.research_type}`,
    m.journal_type && `Target journal: ${m.journal_type}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function compileRecordedDesign(study: Study): string | null {
  const decisions = listDecisions(study.id);
  const parts: string[] = [];
  for (const kind of DESIGN_ARTIFACT_KINDS) {
    const compiled = compileArtifact(study, decisions, kind);
    const stored = getOrCreateArtifact(study.id, kind);
    parts.push(renderArtifactMarkdown(compiled, stored.override_md));
  }
  const joined = parts.join("\n\n---\n\n").trim();
  return joined.length > 0 ? joined : null;
}

/** Compile the brief content from a reconciled readiness check. */
export function compileDraftingBrief(checkId: string): BriefContent {
  const check = getReadinessCheck(checkId);
  if (!check) throw new Error("readiness check not found");
  const manuscript = getManuscript(check.manuscript_id);
  if (!manuscript) throw new Error("manuscript not found");

  const items = listReadinessItems(checkId);
  const accepted = items.filter((it) => it.status === "accepted");
  const openCount = items.filter((it) => it.status === "open").length;

  const acceptedGaps: BriefGap[] = accepted.map((it: ReadinessCheckItem) => ({
    gateLabel: gateInfo(it.gate).label,
    severity: it.severity
      ? (READINESS_SEVERITY_INFO[it.severity]?.label ?? it.severity)
      : null,
    finding: it.finding_md,
    fix: it.suggested_fix_md,
  }));

  const study = check.study_id ? getStudy(check.study_id) : undefined;
  const recordedDesign = study ? compileRecordedDesign(study) : null;

  return {
    manuscriptId: manuscript.id,
    manuscriptTitle: manuscript.title,
    meta: manuscriptMeta(manuscript),
    manuscriptText: manuscript.content_md,
    acceptedGaps,
    openCount,
    recordedDesign,
  };
}

// ---------------------------------------------------------------------------
// Rendering. A shared grounding body, plus per-output framing + task blocks.
// ---------------------------------------------------------------------------

function gapsBlock(content: BriefContent): string {
  if (content.acceptedGaps.length === 0) {
    return "## Gaps to close\n\nNo outstanding accepted findings — the readiness check surfaced nothing the author committed to fix.";
  }
  const lines = [
    "## Gaps to close",
    "",
    "The author accepted these readiness findings — the new sections must address them:",
    "",
  ];
  for (const g of content.acceptedGaps) {
    const sev = g.severity ? `[${g.severity}] ` : "";
    lines.push(`- ${sev}**${g.gateLabel}:** ${g.finding}`);
    if (g.fix) lines.push(`  - Suggested fix: ${g.fix}`);
  }
  return lines.join("\n");
}

/** Role + rules + inlined grounding (manuscript, gaps, recorded design). */
function groundingBody(content: BriefContent): string {
  const parts: string[] = [
    RULES,
    "",
    "## Manuscript (existing — reconcile with this; do not contradict or invent)",
    "",
    content.meta ? `${content.meta}\n` : "",
    content.manuscriptText.trim(),
    "",
    gapsBlock(content),
  ];
  if (content.recordedDesign) {
    parts.push(
      "",
      "## Recorded study design (the author's own decisions — the factual basis for the methodology)",
      "",
      content.recordedDesign,
    );
  }
  return parts.filter((p) => p !== "").join("\n");
}

const INTRO_LINE =
  "You are helping the author draft sections of a manuscript that already exists. Work strictly from the material below.";

const TASK_BLOCKS: Record<DraftTask, string> = {
  outline:
    "## Your task — OUTLINE\nDraft a section-by-section outline for the article. Derive the structure from the recorded study design and reporting-guideline coverage (when provided) and from the manuscript's existing claims. For each planned section, note in one line what it must contain and which accepted gap(s) above it closes.",
  introduction:
    "## Your task — INTRODUCTION\nDraft the Introduction by reconciling and organizing the author's existing claims into a motivated argument (problem → gap → this study's contribution). Close the accepted gaps above that belong in the introduction. Do not introduce new claims or citations; where a needed point is missing, flag it as a question for the author.",
  methodology:
    "## Your task — METHODOLOGY\nDraft the Methods section by assembling the recorded study design above (protocol / SAP / data dictionary) into prose, and cover the reporting-guideline items. Close the accepted methods-related gaps above. State only what the recorded decisions support; flag anything still unspecified as a question for the author.",
};

const COMBINED_TASK = `## Your task
Draft the following three things, clearly separated under their own headings:

1. **Outline** — a section-by-section structure derived from the recorded design, guideline coverage, and existing claims.
2. **Introduction** — reconcile and organize the existing claims into a motivated argument; close the introduction-related gaps above.
3. **Methodology** — assemble the recorded study design into prose and cover the reporting-guideline items; close the methods-related gaps above.

End by listing, as explicit questions for the author, any information you needed but could not find in the material above.`;

/** One prompt covering outline + introduction + methodology together. */
export function renderCombinedPrompt(content: BriefContent): string {
  return [
    `# Drafting brief — ${content.manuscriptTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(content),
    "",
    COMBINED_TASK,
    "",
  ].join("\n");
}

/** A standalone prompt for a single section. */
export function renderTaskPrompt(content: BriefContent, task: DraftTask): string {
  return [
    `# Drafting brief — ${content.manuscriptTitle}`,
    "",
    INTRO_LINE,
    "",
    groundingBody(content),
    "",
    TASK_BLOCKS[task],
    "",
    "When done, list any information you needed but could not find above as explicit questions for the author.",
    "",
  ].join("\n");
}

/** Combined prompt with an AGENTS.md header note, for CLI agents that auto-read it. */
export function renderAgentsMd(content: BriefContent): string {
  return [
    "<!-- AGENTS.md — drafting brief generated from a reconciled readiness check.",
    "Agents that read this file automatically should treat it as the working brief",
    "for drafting this manuscript's outline, introduction, and methodology. -->",
    "",
    renderCombinedPrompt(content),
  ].join("\n");
}

/** Plain markdown document form, to attach or upload anywhere. */
export function renderBriefMd(content: BriefContent): string {
  return renderCombinedPrompt(content);
}
