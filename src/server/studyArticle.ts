import {
  autoProvisionProjectFolder,
  createManuscript,
  listManuscripts,
  replaceUneditedGeneratedContent,
} from "@/server/manuscripts";
import { createAsset } from "@/server/manuscriptAssets";
import { getModeSchema } from "@/server/methods/cardSchema";
import {
  ALL_ARTIFACT_KINDS,
  compileArtifact,
  renderArtifactMarkdown,
} from "@/server/methods/artifacts";
import { parseValue } from "@/server/methods/preflight";
import {
  getOrCreateArtifact,
  getStudy,
  listDecisions,
  updateArtifact,
} from "@/server/studies";
import type {
  DesignDecision,
  Manuscript,
  Study,
  StudyArtifactKind,
} from "@/server/types";

export interface StudyArticleResult {
  manuscript: Manuscript;
  created: boolean;
  links: {
    article: string;
    workspace: string;
    sourceStudy: string;
  };
}

const MODE_RESEARCH_TYPE: Record<Study["mode"], string> = {
  systematic_review: "systematic-review",
  retrospective_observational: "retrospective-observational",
  interventional: "randomized-trial",
};

const MODE_DOMAIN: Record<Study["mode"], string> = {
  systematic_review: "evidence synthesis",
  retrospective_observational: "clinical epidemiology",
  interventional: "clinical trial",
};

function valueOf(
  byType: Map<string, DesignDecision>,
  cardType: string,
): { value: string; fields: Record<string, string> } {
  const parsed = parseValue(byType.get(cardType)?.value_json ?? null);
  return {
    value: parsed.value?.trim() ?? "",
    fields: parsed.fields ?? {},
  };
}

function bulletLines(fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `- **${key.replaceAll("_", " ")}:** ${value.trim()}`);
}

function firstFilled(...values: Array<string | undefined | null>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function trimSentence(value: string): string {
  return value.trim().replace(/[.。]+$/u, "");
}

function draftTitle(study: Study): string {
  if (study.mode === "systematic_review") {
    return `${study.title.replace(/\s*\([^)]*\)\s*$/, "")}: systematic review protocol`;
  }
  if (study.mode === "retrospective_observational") {
    return `${study.title}: retrospective cohort study`;
  }
  return `${study.title}: study manuscript draft`;
}

function systematicReviewDraft(
  study: Study,
  byType: Map<string, DesignDecision>,
): string {
  const question = valueOf(byType, "review_question");
  const eligibility = valueOf(byType, "eligibility_criteria");
  const sources = valueOf(byType, "information_sources");
  const search = valueOf(byType, "search_strategy");
  const screening = valueOf(byType, "screening_process");
  const extraction = valueOf(byType, "data_extraction");
  const rob = valueOf(byType, "risk_of_bias");
  const effect = valueOf(byType, "effect_measure");
  const synthesis = valueOf(byType, "synthesis_plan");
  const heterogeneity = valueOf(byType, "heterogeneity");
  const subgroups = valueOf(byType, "subgroup_analyses");
  const sensitivity = valueOf(byType, "sensitivity_analyses");
  const certainty = valueOf(byType, "certainty");
  const registration = valueOf(byType, "registration");
  const designs = trimSentence(
    firstFilled(
      eligibility.fields.designs,
      "eligible comparative intervention studies",
    ),
  ).toLowerCase();
  const intervention = trimSentence(
    firstFilled(question.fields.intervention, "the intervention"),
  ).toLowerCase();
  const population = trimSentence(
    firstFilled(question.fields.population, "the target population"),
  ).toLowerCase();
  const primaryOutcome = trimSentence(
    firstFilled(
      effect.fields.measure,
      question.fields.outcome,
      "validated depressive symptom measures",
    ),
  ).toLowerCase();

  return [
    `# ${draftTitle(study)}`,
    "",
    `> Generated from Methods Workbench study \`${study.id}\`. Treat this as a structured article draft; fill results after the review is conducted.`,
    "",
    "## Abstract",
    "**Background:** Smartphone-delivered adaptive interventions are increasingly used in mental-health care, but their comparative effect on depressive symptoms needs synthesis.",
    `**Objective:** ${study.research_question ?? question.value}`,
    `**Methods:** We will include ${designs} that evaluate ${intervention} in ${population}. Primary outcomes will use ${primaryOutcome}.`,
    "**Results:** To be completed after screening and synthesis.",
    "**Conclusions:** To be completed after synthesis and certainty assessment.",
    "",
    "## Introduction",
    "Digital mental-health interventions increasingly use context, symptoms, or engagement signals to adapt support in real time. A review is needed to separate adaptive intervention effects from static app access and usual-care comparators.",
    "",
    "## Methods",
    "### Review Question",
    question.value,
    ...bulletLines(question.fields),
    "",
    "### Eligibility Criteria",
    eligibility.value,
    ...bulletLines(eligibility.fields),
    "",
    "### Information Sources",
    sources.value,
    ...bulletLines(sources.fields),
    "",
    "### Search Strategy",
    search.value,
    ...bulletLines(search.fields),
    "",
    "### Study Selection",
    screening.value,
    ...bulletLines(screening.fields),
    "",
    "### Data Extraction",
    extraction.value,
    ...bulletLines(extraction.fields),
    "",
    "### Risk of Bias",
    rob.value,
    ...bulletLines(rob.fields),
    "",
    "### Effect Measures and Synthesis",
    effect.value,
    ...bulletLines(effect.fields),
    synthesis.value,
    ...bulletLines(synthesis.fields),
    "",
    "### Heterogeneity and Additional Analyses",
    heterogeneity.value,
    ...bulletLines(heterogeneity.fields),
    subgroups.value,
    ...bulletLines(subgroups.fields),
    sensitivity.value,
    ...bulletLines(sensitivity.fields),
    "",
    "### Certainty of Evidence",
    certainty.value,
    ...bulletLines(certainty.fields),
    "",
    "### Registration",
    registration.value,
    ...bulletLines(registration.fields),
    "",
    "## Results",
    "_Pending screening, extraction, and synthesis._",
    "",
    "## Discussion",
    "_Pending results. Discuss intervention adaptivity, comparator heterogeneity, attrition, safety reporting, and certainty of evidence._",
    "",
    "## Declarations",
    "**Funding:** _To be added._",
    "**Competing interests:** _To be added._",
    "**Data availability:** Extraction forms, search strings, and analytic code will be described here.",
  ].filter((line) => line !== undefined).join("\n");
}

function genericStudyDraft(
  study: Study,
  decisions: DesignDecision[],
): string {
  const schema = getModeSchema(study.mode);
  const byType = new Map(decisions.map((decision) => [decision.card_type, decision]));
  const sections = schema.cards.map((card) => {
    const value = valueOf(byType, card.key);
    return [
      `### ${card.label}`,
      value.value || "_Not specified yet._",
      ...bulletLines(value.fields),
    ].join("\n");
  });

  return [
    `# ${draftTitle(study)}`,
    "",
    `> Generated from Methods Workbench study \`${study.id}\`. Treat this as a structured article draft; expand narrative sections and fill Results when data are available.`,
    "",
    "## Abstract",
    `**Objective:** ${study.research_question ?? "To be completed."}`,
    "**Methods:** The design decisions below were promoted from Methods Workbench.",
    "**Results:** To be completed.",
    "**Conclusions:** To be completed.",
    "",
    "## Introduction",
    "_Add the clinical or methodological rationale here._",
    "",
    "## Methods",
    ...sections,
    "",
    "## Results",
    "_Pending data collection or analysis._",
    "",
    "## Discussion",
    "_Interpret findings against the pre-specified design decisions._",
    "",
    "## Declarations",
    "**Funding:** _To be added._",
    "**Competing interests:** _To be added._",
    "**Data availability:** _To be added._",
  ].join("\n");
}

function buildDraft(study: Study, decisions: DesignDecision[]): string {
  const byType = new Map(decisions.map((decision) => [decision.card_type, decision]));
  if (study.mode === "systematic_review") {
    return systematicReviewDraft(study, byType);
  }
  return genericStudyDraft(study, decisions);
}

function artifactFilename(kind: StudyArtifactKind): string {
  return `methods-${kind.replaceAll("_", "-")}.md`;
}

function attachArtifacts(study: Study, manuscriptId: string, decisions: DesignDecision[]): void {
  for (const kind of ALL_ARTIFACT_KINDS) {
    const compiled = compileArtifact(study, decisions, kind);
    const stored = getOrCreateArtifact(study.id, kind);
    updateArtifact(study.id, kind, {
      compiled_json: JSON.stringify(compiled),
      ready_pct: compiled.ready_pct,
    });
    const md = renderArtifactMarkdown(compiled, stored.override_md);
    createAsset({
      manuscriptId,
      kind: "appendix",
      label: `Methods Workbench - ${compiled.title}`,
      original_file: artifactFilename(kind),
      file_format: "markdown",
      content_md: md,
    });
  }
}

export function createArticleFromStudy(
  studyId: string,
  opts: { reuseExisting?: boolean } = {},
): StudyArticleResult {
  const study = getStudy(studyId);
  if (!study) throw new Error("study not found");

  if (opts.reuseExisting !== false) {
    const existing = listManuscripts({ studyId, limit: 1 })[0];
    if (existing) {
      const generatedByThisStudy =
        existing.original_file === `methods-workbench-${study.id}.md` &&
        existing.review_request?.startsWith(
          `Draft generated from Methods Workbench study ${study.id}.`,
        );
      const manuscript = generatedByThisStudy
        ? replaceUneditedGeneratedContent(
            existing.id,
            buildDraft(study, listDecisions(study.id)),
          ) ?? existing
        : existing;
      return {
        manuscript,
        created: false,
        links: {
          article: `/my-articles/${manuscript.id}`,
          workspace: `/my-articles/${manuscript.id}/workspace`,
          sourceStudy: `/methods-workbench/${study.id}`,
        },
      };
    }
  }

  const decisions = listDecisions(study.id);
  const draft = buildDraft(study, decisions);
  const manuscript = createManuscript({
    study_id: study.id,
    title: draftTitle(study),
    content_md: draft,
    original_file: `methods-workbench-${study.id}.md`,
    file_format: "markdown",
    research_domain: MODE_DOMAIN[study.mode],
    research_type: MODE_RESEARCH_TYPE[study.mode],
    review_request:
      `Draft generated from Methods Workbench study ${study.id}. ` +
      "Expand the manuscript while preserving the pre-specified design decisions.",
  });

  attachArtifacts(study, manuscript.id, decisions);
  const linked = autoProvisionProjectFolder(manuscript.id);

  return {
    manuscript: linked,
    created: true,
    links: {
      article: `/my-articles/${linked.id}`,
      workspace: `/my-articles/${linked.id}/workspace`,
      sourceStudy: `/methods-workbench/${study.id}`,
    },
  };
}
