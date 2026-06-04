import { getModeSchema, getCardDef, type CardDef } from "./cardSchema";
import { getChecklistTemplate } from "../checklistKnowledge";
import { isReadyState, parseValue } from "./preflight";
import type {
  DesignDecision,
  Study,
  StudyArtifactKind,
  StudyMode,
} from "../types";

// ===========================================================================
// Artifact compiler. Compiles decision cards into protocol / SAP / data-
// dictionary / checklist-map / PROSPERO sections. Artifacts are compiled
// (never the source of truth); a section is "ready" iff its source cards are.
// The UI exposes a per-section editable override (study_artifacts.override_md);
// this module only produces the compiled body.
// ===========================================================================

export interface ArtifactSection {
  key: string;
  heading: string;
  body_md: string;
  ready: boolean;
  source_cards: string[];
}

export interface CompiledArtifact {
  kind: StudyArtifactKind;
  title: string;
  sections: ArtifactSection[];
  ready_pct: number;
}

// Which cards feed each section-based artifact, per mode.
const SAP_CARDS: Record<StudyMode, string[]> = {
  systematic_review: [
    "effect_measure",
    "synthesis_plan",
    "heterogeneity",
    "subgroup_analyses",
    "sensitivity_analyses",
    "certainty",
  ],
  retrospective_observational: [
    "outcome",
    "effect_measure",
    "primary_model",
    "missing_data",
    "sensitivity_analyses",
    "subgroup_analyses",
  ],
  interventional: [
    "primary_outcome",
    "secondary_outcomes",
    "sample_size",
    "analysis_plan",
    "missing_data",
  ],
};

const DATA_DICTIONARY_CARDS: Record<StudyMode, string[]> = {
  systematic_review: ["data_extraction"],
  retrospective_observational: ["exposure", "comparator", "outcome", "confounders"],
  interventional: ["ai_intervention", "comparator", "primary_outcome", "secondary_outcomes"],
};

const REGISTRATION_CARDS: Record<StudyMode, string[]> = {
  systematic_review: [
    "review_question",
    "eligibility_criteria",
    "information_sources",
    "search_strategy",
    "risk_of_bias",
    "synthesis_plan",
    "registration",
  ],
  retrospective_observational: ["clinical_question", "data_source", "ethics", "reporting"],
  interventional: [
    "research_question",
    "eligibility",
    "ai_intervention",
    "comparator",
    "primary_outcome",
    "ethics_consent",
    "registration",
  ],
};

function renderCardBody(def: CardDef, decision: DesignDecision | undefined): string {
  const value = parseValue(decision?.value_json ?? null);
  const lines: string[] = [];
  if (value.value && value.value.trim()) lines.push(value.value.trim());
  for (const f of def.requiredFields) {
    const v = value.fields?.[f.id];
    lines.push(`- **${f.label}:** ${v && v.trim() ? v.trim() : "_(not specified)_"}`);
  }
  if (decision?.open_question_md) {
    lines.push(`\n> Open question: ${decision.open_question_md}`);
  }
  return lines.join("\n");
}

function sectionFromCard(
  mode: StudyMode,
  cardType: string,
  byType: Map<string, DesignDecision>,
): ArtifactSection | null {
  const def = getCardDef(mode, cardType);
  if (!def) return null;
  const decision = byType.get(cardType);
  return {
    key: cardType,
    heading: def.label,
    body_md: renderCardBody(def, decision),
    ready: isReadyState(decision?.state ?? "not_started"),
    source_cards: [cardType],
  };
}

function readyPctOf(sections: ArtifactSection[]): number {
  if (sections.length === 0) return 0;
  const ready = sections.filter((s) => s.ready).length;
  return Math.round((ready / sections.length) * 100);
}

function compileSectioned(
  study: Pick<Study, "mode">,
  byType: Map<string, DesignDecision>,
  kind: StudyArtifactKind,
  title: string,
  cardKeys: string[],
): CompiledArtifact {
  const sections = cardKeys
    .map((k) => sectionFromCard(study.mode, k, byType))
    .filter((s): s is ArtifactSection => s !== null);
  return { kind, title, sections, ready_pct: readyPctOf(sections) };
}

function compileChecklistMap(
  study: Pick<Study, "mode">,
  byType: Map<string, DesignDecision>,
): CompiledArtifact {
  const schema = getModeSchema(study.mode);
  const sections: ArtifactSection[] = [];
  let coveredTotal = 0;
  let itemTotal = 0;
  for (const guideline of schema.guidelines) {
    const template = getChecklistTemplate(guideline);
    // Card key(s) that supply each guideline item.
    const suppliers = new Map<string, string[]>();
    for (const def of schema.cards) {
      for (const key of def.guidelineItems[guideline] ?? []) {
        const list = suppliers.get(key) ?? [];
        list.push(def.key);
        suppliers.set(key, list);
      }
    }
    const lines: string[] = [];
    let covered = 0;
    for (const item of template.items) {
      const cards = suppliers.get(item.item_key) ?? [];
      const isCovered = cards.some((c) =>
        isReadyState(byType.get(c)?.state ?? "not_started"),
      );
      if (isCovered) covered++;
      const cardLabels = cards
        .map((c) => getCardDef(study.mode, c)?.label ?? c)
        .join(", ");
      lines.push(
        `- ${isCovered ? "✓" : "☐"} **${item.item_key}** (${item.section}) — ${item.prompt}` +
          (cardLabels ? `  _← ${cardLabels}_` : "  _← (no card maps here yet)_"),
      );
    }
    coveredTotal += covered;
    itemTotal += template.items.length;
    sections.push({
      key: guideline,
      heading: `${guideline} (${covered}/${template.items.length})`,
      body_md: lines.join("\n"),
      ready: covered === template.items.length,
      source_cards: schema.cards
        .filter((d) => (d.guidelineItems[guideline] ?? []).length > 0)
        .map((d) => d.key),
    });
  }
  return {
    kind: "checklist_map",
    title: "Reporting-guideline map",
    sections,
    ready_pct: itemTotal === 0 ? 0 : Math.round((coveredTotal / itemTotal) * 100),
  };
}

function compileDataDictionary(
  study: Pick<Study, "mode">,
  byType: Map<string, DesignDecision>,
): CompiledArtifact {
  const cardKeys = DATA_DICTIONARY_CARDS[study.mode];
  const rows: string[] = [
    "| Variable | Source decision | Definition |",
    "| --- | --- | --- |",
  ];
  const sourceSections: ArtifactSection[] = [];
  for (const cardType of cardKeys) {
    const def = getCardDef(study.mode, cardType);
    if (!def) continue;
    const decision = byType.get(cardType);
    const value = parseValue(decision?.value_json ?? null);
    const ready = isReadyState(decision?.state ?? "not_started");
    sourceSections.push({
      key: cardType,
      heading: def.label,
      body_md: renderCardBody(def, decision),
      ready,
      source_cards: [cardType],
    });
    const definition = (value.value ?? "").replace(/\n+/g, " ").trim() || "_(not specified)_";
    rows.push(`| ${def.label} | ${cardType} | ${definition} |`);
  }
  return {
    kind: "data_dictionary",
    title: "Data dictionary",
    sections: [
      {
        key: "variables",
        heading: "Variables",
        body_md: rows.join("\n"),
        ready: sourceSections.every((s) => s.ready) && sourceSections.length > 0,
        source_cards: cardKeys,
      },
      ...sourceSections,
    ],
    ready_pct: readyPctOf(sourceSections),
  };
}

export function compileArtifact(
  study: Pick<Study, "mode">,
  decisions: DesignDecision[],
  kind: StudyArtifactKind,
): CompiledArtifact {
  const byType = new Map<string, DesignDecision>();
  for (const d of decisions) byType.set(d.card_type, d);
  const schema = getModeSchema(study.mode);

  switch (kind) {
    case "protocol":
      return compileSectioned(
        study,
        byType,
        "protocol",
        "Protocol draft",
        schema.cards.map((c) => c.key),
      );
    case "sap":
      return compileSectioned(
        study,
        byType,
        "sap",
        "Statistical analysis plan",
        SAP_CARDS[study.mode],
      );
    case "data_dictionary":
      return compileDataDictionary(study, byType);
    case "checklist_map":
      return compileChecklistMap(study, byType);
    case "prospero_fields":
      return compileSectioned(
        study,
        byType,
        "prospero_fields",
        study.mode === "systematic_review"
          ? "PROSPERO registration fields"
          : study.mode === "interventional"
            ? "Trial registration fields"
            : "Registration fields",
        REGISTRATION_CARDS[study.mode],
      );
  }
}

export const ALL_ARTIFACT_KINDS: StudyArtifactKind[] = [
  "protocol",
  "sap",
  "data_dictionary",
  "checklist_map",
  "prospero_fields",
];

/** Render a compiled artifact (plus optional user override) to markdown. */
export function renderArtifactMarkdown(
  compiled: CompiledArtifact,
  overrideMd?: string | null,
): string {
  const parts: string[] = [`# ${compiled.title}`, `\n_${compiled.ready_pct}% structurally ready_\n`];
  for (const s of compiled.sections) {
    parts.push(`## ${s.heading}${s.ready ? "" : " _(incomplete)_"}\n\n${s.body_md}\n`);
  }
  if (overrideMd && overrideMd.trim()) {
    parts.push(`\n---\n\n## Manual additions\n\n${overrideMd.trim()}\n`);
  }
  return parts.join("\n");
}
