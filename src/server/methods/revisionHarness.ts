import { getReadinessCheck, listReadinessItems } from "../readinessChecks";
import { getManuscript } from "../manuscripts";
import { getStudy } from "../studies";
import {
  NO_INVENT_RULES,
  manuscriptMeta,
  compileRecordedDesign,
  toPromptFindings,
  findingLine,
  type PromptFinding,
} from "./promptParts";

// ===========================================================================
// Revision-harness compiler. Turns a reconciled readiness check into a prompt
// that drives an AI to REVISE the existing manuscript to close the findings the
// author accepted — following this repo's revision conventions (small, focused,
// reversible edits; preserve voice; revised text + section pointers; a revision
// table). NOT a drafting generator. Pure + deterministic; self-contained output
// that works in a browser chat or a CLI agent.
// ===========================================================================

export interface HarnessContent {
  manuscriptId: string;
  manuscriptTitle: string;
  meta: string;
  manuscriptText: string;
  findings: PromptFinding[];
  /** Count of readiness items still `open` (not yet accepted or dismissed). */
  openCount: number;
  /** Compiled recorded design, when a study is linked — helps ground methods fixes. */
  recordedDesign: string | null;
}

export function compileRevisionHarness(checkId: string): HarnessContent {
  const check = getReadinessCheck(checkId);
  if (!check) throw new Error("readiness check not found");
  const manuscript = getManuscript(check.manuscript_id);
  if (!manuscript) throw new Error("manuscript not found");

  const items = listReadinessItems(checkId);
  const accepted = items.filter((it) => it.status === "accepted");
  const openCount = items.filter((it) => it.status === "open").length;

  const study = check.study_id ? getStudy(check.study_id) : undefined;

  return {
    manuscriptId: manuscript.id,
    manuscriptTitle: manuscript.title,
    meta: manuscriptMeta(manuscript),
    manuscriptText: manuscript.content_md,
    findings: toPromptFindings(accepted),
    openCount,
    recordedDesign: study ? compileRecordedDesign(study) : null,
  };
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

const INTRO_LINE =
  "You are a revision assistant. Revise the existing manuscript below to close the readiness findings the author accepted. Work strictly from the material provided.";

const REVISE_RULES = `## Rules
- Revise the existing manuscript to address the findings. Make small, focused, reversible edits; do not rewrite whole sections unless a finding requires it.
${NO_INVENT_RULES}
- For each finding, give the concrete revised or added text and a section pointer (e.g. "§Methods, para 2") showing where it goes.
- When done, produce a revision table (e.g. \`revision_table_<YYYY-MM-DD>.md\`): one row per finding — the issue, the action taken, and the section affected.`;

function manuscriptBlock(c: HarnessContent): string {
  const parts = [
    "## Manuscript (the text to revise; do not contradict or invent)",
    "",
    c.meta ? `${c.meta}\n` : "",
    c.manuscriptText.trim(),
  ];
  if (c.recordedDesign) {
    parts.push(
      "",
      "## Recorded study design (the author's own decisions — ground methods fixes in this)",
      "",
      c.recordedDesign,
    );
  }
  return parts.filter((p) => p !== "").join("\n");
}

function header(c: HarnessContent, title: string): string {
  return [`# ${title} — ${c.manuscriptTitle}`, "", INTRO_LINE, "", REVISE_RULES, "", manuscriptBlock(c)].join(
    "\n",
  );
}

/** One prompt that closes every accepted finding. */
export function renderHarnessPrompt(c: HarnessContent): string {
  const worklist =
    c.findings.length > 0
      ? c.findings.map(findingLine).join("\n")
      : "No accepted findings — the author did not commit to any fixes.";
  return [
    header(c, "Revision harness"),
    "",
    "## Findings to close",
    "",
    worklist,
    "",
    "## Your task",
    "Revise the manuscript to close each finding above. Address every finding; for each, give the revised text and its section pointer, then compile the revision table.",
    "",
  ].join("\n");
}

/** A standalone prompt that closes a single finding. */
export function renderFindingPrompt(c: HarnessContent, finding: PromptFinding): string {
  return [
    header(c, "Revision step"),
    "",
    "## Finding to close",
    "",
    findingLine(finding),
    "",
    "## Your task",
    "Revise the manuscript to close this one finding. Give the revised text and its section pointer, then add the corresponding revision-table row.",
    "",
  ].join("\n");
}

export function renderAgentsMd(c: HarnessContent): string {
  return [
    "<!-- AGENTS.md — revision harness generated from a reconciled readiness check.",
    "Agents that read this file automatically should treat it as the working brief",
    "for revising this manuscript to close the accepted readiness findings. -->",
    "",
    renderHarnessPrompt(c),
  ].join("\n");
}

export function renderHarnessMd(c: HarnessContent): string {
  return renderHarnessPrompt(c);
}
