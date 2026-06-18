import { listDecisions, getOrCreateArtifact } from "../studies";
import { compileArtifact, renderArtifactMarkdown } from "./artifacts";
import { gateInfo, READINESS_SEVERITY_INFO } from "@/lib/methodsLabels";
import type { ReadinessCheckItem, Study, StudyArtifactKind } from "../types";

// ===========================================================================
// Shared, pure building blocks for the prompt generators (studyDraftingPrompts
// and revisionHarness). No network, no LLM call. Everything here is compiled
// only from first-party material the user already recorded, and the rendered
// prompts instruct the AI never to invent — per the project's hard rule that the
// agent generates no novel research content.
// ===========================================================================

/** The no-invention rule shared by every generated prompt. */
export const NO_INVENT_RULES = `- Use ONLY the material provided below. Do NOT invent findings, data, citations, numbers, or claims that are not already present.
- Where something needed is missing, list it as an explicit question for the author rather than fabricating it.
- Preserve the author's voice, terminology, and existing structure.`;

/** Recorded-design artifacts that ground the methodology, in render order. */
const DESIGN_ARTIFACT_KINDS: StudyArtifactKind[] = [
  "protocol",
  "sap",
  "data_dictionary",
  "checklist_map",
];

export function manuscriptMeta(m: {
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

/** Compile a study's protocol/SAP/data-dictionary/checklist into one markdown
 * block (with any user overrides), or null when nothing has been recorded. */
export function compileRecordedDesign(study: Study): string | null {
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

export interface PromptFinding {
  gateLabel: string;
  severity: string | null;
  finding: string;
  fix: string | null;
}

/** Normalize readiness items into display-ready findings (humanized labels). */
export function toPromptFindings(items: ReadinessCheckItem[]): PromptFinding[] {
  return items.map((it) => ({
    gateLabel: gateInfo(it.gate).label,
    severity: it.severity
      ? (READINESS_SEVERITY_INFO[it.severity]?.label ?? it.severity)
      : null,
    finding: it.finding_md,
    fix: it.suggested_fix_md,
  }));
}

/** One worklist bullet for a finding (issue + optional suggested fix). */
export function findingLine(f: PromptFinding): string {
  const sev = f.severity ? `[${f.severity}] ` : "";
  let line = `- ${sev}**${f.gateLabel}:** ${f.finding}`;
  if (f.fix) line += `\n  - Suggested fix: ${f.fix}`;
  return line;
}
