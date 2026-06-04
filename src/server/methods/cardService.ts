import {
  getStudy,
  getDecision,
  getDecisionById,
  patchDecision,
  markDownstreamStale,
  appendDecisionLog,
  listDecisions,
  listDecisionLog,
  listEvidenceLinks,
} from "../studies";
import { getCardDef } from "./cardSchema";
import { computeDerivedState, parseValue } from "./preflight";
import { exportStudy } from "./studyExport";
import type { DecisionState, DecisionValue, DesignDecision } from "../types";

// Orchestrates a card write: merges the value, derives the completeness state
// (unless the user picked a sticky state or the card is locked), clears its own
// staleness, propagates staleness to downstream cards when the value actually
// changed, appends a decision-log entry, and re-exports the markdown mirror.

export interface SetCardInput {
  value?: string;
  fields?: Record<string, string>;
  /** Explicit sticky state (unknown/assumed/needs_input/locked) or omit to derive. */
  state?: DecisionState;
  open_question_md?: string | null;
  reason_md?: string | null;
  rejected_alternatives_md?: string | null;
  open_concern_md?: string | null;
  evidence_ids?: string[];
}

function reexport(studyId: string): void {
  const study = getStudy(studyId);
  if (!study) return;
  try {
    exportStudy(study, listDecisions(studyId), listDecisionLog(studyId));
  } catch {
    /* export is best-effort */
  }
}

export function setCard(
  studyId: string,
  cardType: string,
  input: SetCardInput,
): DesignDecision | undefined {
  const study = getStudy(studyId);
  if (!study) return undefined;
  const def = getCardDef(study.mode, cardType);
  if (!def) return undefined;
  const existing = getDecision(studyId, cardType);
  if (!existing) return undefined;

  const prev = parseValue(existing.value_json);
  const value: DecisionValue = {
    value: input.value !== undefined ? input.value : prev.value,
    fields: { ...(prev.fields ?? {}), ...(input.fields ?? {}) },
  };
  const hasEvidence = listEvidenceLinks(existing.id).length > 0;

  let state: DecisionState;
  if (input.state) {
    state = input.state;
  } else if (existing.state === "locked") {
    state = "locked";
  } else {
    state = computeDerivedState(def, value, hasEvidence);
  }

  const changed =
    (input.value !== undefined && input.value !== prev.value) ||
    Boolean(input.fields && Object.keys(input.fields).length > 0) ||
    (input.state === "locked" && existing.state !== "locked");

  patchDecision(studyId, cardType, {
    value_json: JSON.stringify(value),
    state,
    open_question_md:
      input.open_question_md !== undefined
        ? input.open_question_md
        : existing.open_question_md,
    stale: false,
  });

  if (changed) markDownstreamStale(study, cardType);

  const action =
    input.state === "locked"
      ? "locked"
      : input.state === "unknown" ||
          input.state === "assumed" ||
          input.state === "needs_input"
        ? "changed"
        : existing.state === "not_started"
          ? "set"
          : "changed";

  appendDecisionLog({
    study_id: studyId,
    decision_id: existing.id,
    card_type: cardType,
    action,
    decision_md: value.value ?? null,
    reason_md: input.reason_md ?? null,
    rejected_alternatives_md: input.rejected_alternatives_md ?? null,
    open_concern_md: input.open_concern_md ?? null,
    evidence_ids_json: input.evidence_ids
      ? JSON.stringify(input.evidence_ids)
      : null,
  });

  reexport(studyId);
  return getDecision(studyId, cardType);
}

/** Re-derive a card's completeness state after evidence links change. Leaves
 * sticky/locked states untouched. */
export function recomputeCardState(decisionId: string): DesignDecision | undefined {
  const decision = getDecisionById(decisionId);
  if (!decision) return undefined;
  const study = getStudy(decision.study_id);
  if (!study) return undefined;
  const def = getCardDef(study.mode, decision.card_type);
  if (!def) return undefined;
  if (
    decision.state === "locked" ||
    decision.state === "unknown" ||
    decision.state === "assumed" ||
    decision.state === "needs_input"
  ) {
    return decision;
  }
  const value = parseValue(decision.value_json);
  const hasEvidence = listEvidenceLinks(decisionId).length > 0;
  const state = computeDerivedState(def, value, hasEvidence);
  return patchDecision(study.id, decision.card_type, { state });
}
