import {
  getModeSchema,
  getCardDef,
  downstreamCards,
  type CardDef,
} from "./cardSchema";
import { getChecklistTemplate } from "../checklistKnowledge";
import type {
  DesignDecision,
  DecisionState,
  DecisionValue,
  Study,
  PreflightLayer,
  PreflightSeverity,
  ReportingGuideline,
} from "../types";

// ===========================================================================
// Deterministic preflight. Pure TS, zero LLM calls. Computes a card's derived
// state from its value, runs completeness + cross-card consistency checks,
// maps cards to reporting-guideline coverage, and reports overall readiness.
// The agent risk pass (immortal-time bias etc.) is separate and persists its
// findings; these computed findings are always recomputed fresh.
// ===========================================================================

const READY_STATES: DecisionState[] = [
  "drafted",
  "evidence_supported",
  "locked",
  "assumed",
];

export function isReadyState(state: DecisionState): boolean {
  return READY_STATES.includes(state);
}

/** User-chosen states the engine must not overwrite when re-deriving. */
const STICKY_STATES: DecisionState[] = [
  "locked",
  "unknown",
  "assumed",
  "needs_input",
];

export function isStickyState(state: DecisionState): boolean {
  return STICKY_STATES.includes(state);
}

export function parseValue(json: string | null): DecisionValue {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as DecisionValue;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function nonEmpty(s: string | undefined | null): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

export function missingRequiredFields(
  def: CardDef,
  value: DecisionValue,
): string[] {
  return def.requiredFields
    .filter((f) => !nonEmpty(value.fields?.[f.id]))
    .map((f) => f.label);
}

/** Derive the completeness state from a card's value. Does not return the
 * sticky states (locked/unknown/assumed/needs_input) — those are user-chosen
 * and preserved by callers. Conflict is surfaced via findings, not state. */
export function computeDerivedState(
  def: CardDef,
  value: DecisionValue,
  hasEvidence: boolean,
): DecisionState {
  const hasHeadline = nonEmpty(value.value);
  const anyField = def.requiredFields.some((f) => nonEmpty(value.fields?.[f.id]));
  if (!hasHeadline && !anyField) return "not_started";
  if (missingRequiredFields(def, value).length > 0) return "underspecified";
  return hasEvidence ? "evidence_supported" : "drafted";
}

export interface ComputedFinding {
  layer: PreflightLayer;
  severity: PreflightSeverity;
  card_type: string | null;
  title: string;
  detail_md?: string;
}

export interface GuidelineCount {
  guideline: ReportingGuideline;
  ready: number;
  total: number;
}

export interface DeterministicReport {
  findings: ComputedFinding[];
  mapping: GuidelineCount[];
  readyPct: number;
  staleCards: string[];
  /** Card label the user should tackle next (most upstream not-ready card). */
  nextBestAction: string | null;
  /** card_type of the next-best-action card, for jump-to navigation. */
  nextBestActionCard: string | null;
}

function humanState(state: DecisionState): string {
  switch (state) {
    case "not_started":
      return "not started";
    case "needs_input":
      return "blocked on an open question";
    default:
      return state;
  }
}

export function runDeterministicPreflight(input: {
  study: Pick<Study, "mode">;
  decisions: DesignDecision[];
}): DeterministicReport {
  const { study, decisions } = input;
  const schema = getModeSchema(study.mode);
  const byType = new Map<string, DesignDecision>();
  for (const d of decisions) byType.set(d.card_type, d);

  const findings: ComputedFinding[] = [];

  // --- Completeness: every card must reach a ready state ------------------
  let nextBestAction: string | null = null;
  let nextBestActionCard: string | null = null;
  for (const def of schema.cards) {
    const decision = byType.get(def.key);
    const state = decision?.state ?? "not_started";
    if (isReadyState(state)) continue;
    const isUpstream = downstreamCards(study.mode, def.key).length > 0;
    const severity: PreflightSeverity = isUpstream ? "blocking" : "important";
    const value = parseValue(decision?.value_json ?? null);
    const missing = missingRequiredFields(def, value);
    const detail =
      state === "underspecified" && missing.length
        ? `Missing: ${missing.join(", ")}.`
        : decision?.open_question_md
          ? decision.open_question_md
          : def.help;
    findings.push({
      layer: "completeness",
      severity,
      card_type: def.key,
      title: `${def.label} is ${humanState(state)}`,
      detail_md: detail,
    });
    if (!nextBestAction && severity === "blocking") {
      nextBestAction = def.label;
      nextBestActionCard = def.key;
    }
  }
  if (!nextBestAction) {
    const firstNotReady = schema.cards.find((def) => {
      const s = byType.get(def.key)?.state ?? "not_started";
      return !isReadyState(s);
    });
    nextBestAction = firstNotReady ? firstNotReady.label : null;
    nextBestActionCard = firstNotReady ? firstNotReady.key : null;
  }

  // --- Consistency: a ready card whose prerequisite is not ready ----------
  for (const def of schema.cards) {
    const state = byType.get(def.key)?.state ?? "not_started";
    if (!isReadyState(state)) continue;
    for (const dep of def.dependsOn) {
      const depState = byType.get(dep)?.state ?? "not_started";
      if (isReadyState(depState)) continue;
      const depDef = getCardDef(study.mode, dep);
      findings.push({
        layer: "consistency",
        severity: "blocking",
        card_type: def.key,
        title: `${def.label} is specified before ${depDef?.label ?? dep}`,
        detail_md: `${def.label} depends on ${depDef?.label ?? dep}, which is not yet settled — the downstream decision may be incoherent.`,
      });
    }
  }

  // --- Staleness: card flagged because an upstream decision changed -------
  const staleCards: string[] = [];
  for (const d of decisions) {
    if (!d.stale) continue;
    staleCards.push(d.card_type);
    const def = getCardDef(study.mode, d.card_type);
    findings.push({
      layer: "consistency",
      severity: "important",
      card_type: d.card_type,
      title: `${def?.label ?? d.card_type} needs re-check`,
      detail_md: "An upstream decision changed after this card was set.",
    });
  }

  // --- Guideline mapping coverage -----------------------------------------
  const mapping: GuidelineCount[] = schema.guidelines.map((guideline) => {
    const template = getChecklistTemplate(guideline);
    const total = template.items.length;
    const readyKeys = new Set<string>();
    for (const def of schema.cards) {
      const state = byType.get(def.key)?.state ?? "not_started";
      if (!isReadyState(state)) continue;
      for (const key of def.guidelineItems[guideline] ?? []) readyKeys.add(key);
    }
    const ready = template.items.filter((it) => readyKeys.has(it.item_key)).length;
    return { guideline, ready, total };
  });

  // --- Overall readiness ---------------------------------------------------
  const readyCount = decisions.filter((d) => isReadyState(d.state)).length;
  const readyPct =
    decisions.length === 0
      ? 0
      : Math.round((readyCount / decisions.length) * 100);

  return { findings, mapping, readyPct, staleCards, nextBestAction, nextBestActionCard };
}
