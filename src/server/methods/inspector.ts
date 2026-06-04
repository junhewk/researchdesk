import { getStudy, listDecisions, listFindings } from "../studies";
import {
  runDeterministicPreflight,
  type ComputedFinding,
  type GuidelineCount,
} from "./preflight";
import type { PreflightFinding } from "../types";

// Assembles the Preflight Inspector view: deterministic completeness +
// consistency findings (recomputed live, zero LLM) merged with persisted
// agent-produced risk findings.

export interface InspectorView {
  findings: ComputedFinding[];
  riskFindings: PreflightFinding[];
  mapping: GuidelineCount[];
  readyPct: number;
  staleCards: string[];
  nextBestAction: string | null;
  nextBestActionCard: string | null;
  blockingCount: number;
  importantCount: number;
}

export function buildInspector(studyId: string): InspectorView | null {
  const study = getStudy(studyId);
  if (!study) return null;
  const decisions = listDecisions(studyId);
  const det = runDeterministicPreflight({ study, decisions });
  const riskFindings = listFindings(studyId, "open").filter(
    (f) => f.layer === "risk",
  );

  const blockingCount =
    det.findings.filter((f) => f.severity === "blocking").length +
    riskFindings.filter((f) => f.severity === "blocking").length;
  const importantCount =
    det.findings.filter((f) => f.severity === "important").length +
    riskFindings.filter((f) => f.severity === "important").length;

  return {
    findings: det.findings,
    riskFindings,
    mapping: det.mapping,
    readyPct: det.readyPct,
    staleCards: det.staleCards,
    nextBestAction: det.nextBestAction,
    nextBestActionCard: det.nextBestActionCard,
    blockingCount,
    importantCount,
  };
}
