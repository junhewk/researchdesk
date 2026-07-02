import { getCardDef } from "./cardSchema";
import { parseValue } from "./preflight";
import type { DesignDecision, EvidenceItem, Study } from "../types";

export interface ProposalSeed {
  label: string;
  value_suggestion: string;
  fields_suggestion?: Record<string, string>;
  consequence_md: string;
}

/** Trim keys/values and drop any not in `allowedIds` or left empty. Shared by
 * the agent pass (runCardProposalAgent) and the curl-callback route so
 * proposal fields_suggestion payloads sanitize identically regardless of
 * source. */
export function sanitizeProposalFields(
  fields: Record<string, string> | null | undefined,
  allowedIds: string[],
): Record<string, string> | null {
  if (!fields || allowedIds.length === 0) return null;
  const allowed = new Set(allowedIds);
  const out = Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => allowed.has(key) && value),
  );
  return Object.keys(out).length ? out : null;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function uniqPush(
  out: ProposalSeed[],
  seen: Set<string>,
  seed: ProposalSeed,
): void {
  const value = seed.value_suggestion.trim();
  if (!value || seen.has(value.toLowerCase())) return;
  seen.add(value.toLowerCase());
  out.push({
    label: seed.label.trim() || value,
    value_suggestion: value,
    fields_suggestion: seed.fields_suggestion,
    consequence_md: seed.consequence_md.trim(),
  });
}

function firstLabels(items: EvidenceItem[], limit: number): string[] {
  return compact(items.map((i) => i.label)).slice(0, limit);
}

function evidenceForCard(
  study: Study,
  cardType: string,
  evidence: EvidenceItem[],
): EvidenceItem[] {
  const def = getCardDef(study.mode, cardType);
  if (!def) return [];
  const allowed = new Set(def.evidenceKinds);
  return evidence.filter((item) => allowed.has(item.kind));
}

export function buildSeedProposalOptions(opts: {
  study: Study;
  decisions: DesignDecision[];
  evidence: EvidenceItem[];
  cardType: string;
}): ProposalSeed[] {
  const { study, decisions, evidence, cardType } = opts;
  const out: ProposalSeed[] = [];
  const seen = new Set<string>();
  const decision = decisions.find((d) => d.card_type === cardType);
  const value = parseValue(decision?.value_json ?? null);

  if (value.value) {
    uniqPush(out, seen, {
      label: "Keep current value",
      value_suggestion: value.value,
      fields_suggestion: value.fields,
      consequence_md:
        "Already entered on this card; revise the required sub-fields before saving if the framing changes.",
    });
  }

  const isQuestionCard =
    cardType === "clinical_question" || cardType === "review_question";
  if (isQuestionCard && study.research_question) {
    uniqPush(out, seen, {
      label: "Use triage research question",
      value_suggestion: study.research_question,
      consequence_md:
        "Uses the question entered at study creation; still fill the hypothesis or PICO sub-fields before saving.",
    });
  }

  if (isQuestionCard) return out.slice(0, 4);

  const relevant = evidenceForCard(study, cardType, evidence);
  const labels = firstLabels(relevant, 4);

  if (cardType === "confounders" && labels.length > 0) {
    uniqPush(out, seen, {
      label: "Use imported confounder set",
      value_suggestion: labels.join(", "),
      consequence_md:
        "Reuses confounders imported from the evidence snapshot; verify each variable is measurable in the data source.",
    });
  } else {
    for (const label of labels) {
      uniqPush(out, seen, {
        label,
        value_suggestion: label,
        consequence_md:
          "Grounded in an imported evidence item; confirm operational details in this card's required sub-fields.",
      });
    }
  }

  return out.slice(0, 4);
}
