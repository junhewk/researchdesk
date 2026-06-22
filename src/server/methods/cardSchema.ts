import type {
  EvidenceItemKind,
  ReportingGuideline,
  StudyMode,
} from "../types";

// ===========================================================================
// Card-type schema. Data-driven, like checklistKnowledge.ts: each study mode
// declares its decision cards, the sub-fields each card must specify, the
// upstream cards it depends on (for staleness propagation), the reporting-
// guideline items it maps to (for the checklist artifact), and which evidence
// kinds can be dropped onto it. Adding a card type or a mode is a data edit
// here, never a schema migration.
// ===========================================================================

export interface CardField {
  id: string;
  label: string;
}

export interface CardDef {
  key: string;
  label: string;
  /** One-line prompt shown on the card — the decision to be made. */
  help: string;
  /** Sub-fields that must be filled for the card to be considered complete. */
  requiredFields: CardField[];
  /** Upstream card keys; when any changes, this card is marked stale. */
  dependsOn: string[];
  /** Guideline items this card supplies, keyed by guideline. */
  guidelineItems: Partial<Record<ReportingGuideline, string[]>>;
  /** Evidence-item kinds that can be dragged onto this card. */
  evidenceKinds: EvidenceItemKind[];
}

export interface ModeSchema {
  mode: StudyMode;
  label: string;
  /** Reporting guidelines this mode compiles a checklist map against. */
  guidelines: ReportingGuideline[];
  cards: CardDef[];
}

// --------------------------------------------------------------------------
// Systematic review / meta-analysis → PRISMA-P (protocol) + PROSPERO fields
// --------------------------------------------------------------------------

const SR_SCHEMA: ModeSchema = {
  mode: "systematic_review",
  label: "Systematic review",
  guidelines: ["PRISMA-P"],
  cards: [
    {
      key: "review_question",
      label: "Review question",
      help: "State the review question as PICO/PECO.",
      requiredFields: [
        { id: "population", label: "Population" },
        { id: "intervention", label: "Intervention / exposure" },
        { id: "comparator", label: "Comparator" },
        { id: "outcome", label: "Outcome" },
      ],
      dependsOn: [],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-9"] },
      evidenceKinds: ["population", "outcome", "prior_design"],
    },
    {
      key: "eligibility_criteria",
      label: "Eligibility criteria",
      help: "Inclusion/exclusion criteria, including eligible study designs.",
      requiredFields: [
        { id: "inclusion", label: "Inclusion criteria" },
        { id: "exclusion", label: "Exclusion criteria" },
        { id: "designs", label: "Eligible study designs" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-9"] },
      evidenceKinds: ["population", "prior_design"],
    },
    {
      key: "information_sources",
      label: "Information sources",
      help: "Databases, registers, and other sources to be searched.",
      requiredFields: [
        { id: "databases", label: "Databases / registers" },
        { id: "date_range", label: "Planned date range" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-10"] },
      evidenceKinds: ["other"],
    },
    {
      key: "search_strategy",
      label: "Search strategy",
      help: "Full search strategy covering every concept of the question.",
      requiredFields: [
        { id: "strategy", label: "Draft strategy / concept blocks" },
        { id: "limits", label: "Language / date limits + justification" },
      ],
      dependsOn: ["review_question", "eligibility_criteria", "information_sources"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-10"] },
      evidenceKinds: ["other"],
    },
    {
      key: "screening_process",
      label: "Screening process",
      help: "How records are screened (independent duplication, conflict resolution).",
      requiredFields: [
        { id: "process", label: "Screening process" },
        { id: "reviewers", label: "Number of reviewers / duplication" },
      ],
      dependsOn: ["eligibility_criteria"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-12"] },
      evidenceKinds: [],
    },
    {
      key: "data_extraction",
      label: "Data extraction",
      help: "What data are extracted and how (independent duplication).",
      requiredFields: [
        { id: "items", label: "Data items to extract" },
        { id: "process", label: "Extraction process" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-13"] },
      evidenceKinds: ["measure", "outcome"],
    },
    {
      key: "risk_of_bias",
      label: "Risk-of-bias tool",
      help: "Risk-of-bias instrument appropriate to the eligible designs.",
      requiredFields: [
        { id: "tool", label: "Tool (e.g. RoB 2, ROBINS-I)" },
        { id: "process", label: "Assessment process" },
      ],
      dependsOn: ["eligibility_criteria"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-14"] },
      evidenceKinds: ["bias"],
    },
    {
      key: "effect_measure",
      label: "Effect measure",
      help: "Summary effect measure (RR, OR, MD, SMD…).",
      requiredFields: [{ id: "measure", label: "Effect measure" }],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-15"] },
      evidenceKinds: ["outcome"],
    },
    {
      key: "synthesis_plan",
      label: "Synthesis plan",
      help: "Narrative vs meta-analysis; model and rationale.",
      requiredFields: [
        { id: "approach", label: "Synthesis approach" },
        { id: "model", label: "Meta-analysis model (if any)" },
      ],
      dependsOn: ["effect_measure", "review_question"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-15"] },
      evidenceKinds: [],
    },
    {
      key: "heterogeneity",
      label: "Heterogeneity",
      help: "How statistical heterogeneity is assessed (I², τ²).",
      requiredFields: [{ id: "approach", label: "Heterogeneity approach" }],
      dependsOn: ["synthesis_plan"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-15"] },
      evidenceKinds: [],
    },
    {
      key: "subgroup_analyses",
      label: "Subgroup analyses",
      help: "Pre-specified subgroup analyses and rationale.",
      requiredFields: [{ id: "subgroups", label: "Pre-specified subgroups" }],
      dependsOn: ["synthesis_plan"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-15"] },
      evidenceKinds: ["population"],
    },
    {
      key: "sensitivity_analyses",
      label: "Sensitivity analyses",
      help: "Pre-specified sensitivity analyses.",
      requiredFields: [{ id: "analyses", label: "Sensitivity analyses" }],
      dependsOn: ["synthesis_plan"],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-15"] },
      evidenceKinds: [],
    },
    {
      key: "certainty",
      label: "Certainty of evidence",
      help: "How certainty is rated (e.g. GRADE).",
      requiredFields: [{ id: "approach", label: "Certainty approach" }],
      dependsOn: ["synthesis_plan"],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "registration",
      label: "Registration",
      help: "Registry (PROSPERO) and reporting-guideline commitment.",
      requiredFields: [
        { id: "registry", label: "Registry + ID (or planned)" },
      ],
      dependsOn: [],
      guidelineItems: { "PRISMA-P": ["PRISMA-P-1a", "PRISMA-P-3"] },
      evidenceKinds: [],
    },
  ],
};

// --------------------------------------------------------------------------
// Retrospective observational → STROBE + RECORD; SAP + data-dictionary
// --------------------------------------------------------------------------

const OBS_SCHEMA: ModeSchema = {
  mode: "retrospective_observational",
  label: "Retrospective observational",
  guidelines: ["STROBE", "RECORD"],
  cards: [
    {
      key: "clinical_question",
      label: "Clinical question",
      help: "The causal/associational question and pre-specified hypothesis.",
      requiredFields: [
        { id: "question", label: "Question" },
        { id: "hypothesis", label: "Pre-specified hypothesis" },
      ],
      dependsOn: [],
      guidelineItems: { STROBE: ["STROBE-3"] },
      evidenceKinds: ["population", "outcome", "prior_design"],
    },
    {
      key: "data_source",
      label: "Data source",
      help: "The routinely-collected dataset and its provenance.",
      requiredFields: [
        { id: "source", label: "Dataset / source" },
        { id: "coverage", label: "Coverage + linkage" },
      ],
      dependsOn: [],
      guidelineItems: { STROBE: ["STROBE-6"], RECORD: ["RECORD-1.1", "RECORD-12.1"] },
      evidenceKinds: ["other"],
    },
    {
      key: "target_population",
      label: "Target population",
      help: "The source population the cohort is drawn from.",
      requiredFields: [{ id: "population", label: "Target population" }],
      dependsOn: ["data_source"],
      guidelineItems: { STROBE: ["STROBE-6"], RECORD: ["RECORD-6.1"] },
      evidenceKinds: ["population"],
    },
    {
      key: "cohort_entry",
      label: "Cohort entry / index date",
      help: "When a patient enters the cohort and the index date is set.",
      requiredFields: [
        { id: "index_date", label: "Index date definition" },
        { id: "entry_rule", label: "Cohort entry rule" },
      ],
      dependsOn: ["target_population", "data_source"],
      guidelineItems: { STROBE: ["STROBE-4"], RECORD: ["RECORD-6.1"] },
      evidenceKinds: ["other"],
    },
    {
      key: "eligibility",
      label: "Eligibility criteria",
      help: "Inclusion/exclusion criteria operationalized in the data.",
      requiredFields: [
        { id: "inclusion", label: "Inclusion" },
        { id: "exclusion", label: "Exclusion" },
      ],
      dependsOn: ["target_population", "cohort_entry"],
      guidelineItems: { STROBE: ["STROBE-6"], RECORD: ["RECORD-6.1", "RECORD-6.2"] },
      evidenceKinds: ["population"],
    },
    {
      key: "exposure",
      label: "Exposure definition",
      help: "Operational exposure definition and ascertainment window.",
      requiredFields: [
        { id: "definition", label: "Exposure definition" },
        { id: "window", label: "Ascertainment window" },
        { id: "codes", label: "Codes / algorithm" },
      ],
      dependsOn: ["cohort_entry"],
      guidelineItems: { STROBE: ["STROBE-7"], RECORD: ["RECORD-7.1"] },
      evidenceKinds: ["measure", "other"],
    },
    {
      key: "comparator",
      label: "Comparator",
      help: "Operational comparator group and co-intervention handling.",
      requiredFields: [
        { id: "definition", label: "Comparator definition" },
        { id: "window", label: "Eligibility window" },
      ],
      dependsOn: ["exposure"],
      guidelineItems: { STROBE: ["STROBE-7"] },
      evidenceKinds: ["measure", "other"],
    },
    {
      key: "outcome",
      label: "Outcome definition",
      help: "Primary outcome, measurement timepoint, and ascertainment.",
      requiredFields: [
        { id: "outcome", label: "Outcome" },
        { id: "timepoint", label: "Measurement timepoint" },
        { id: "ascertainment", label: "Ascertainment / data source" },
      ],
      dependsOn: ["cohort_entry"],
      guidelineItems: { STROBE: ["STROBE-7"], RECORD: ["RECORD-7.1"] },
      evidenceKinds: ["outcome"],
    },
    {
      key: "follow_up",
      label: "Follow-up window",
      help: "Follow-up period and censoring rules.",
      requiredFields: [
        { id: "window", label: "Follow-up window" },
        { id: "censoring", label: "Censoring rules" },
      ],
      dependsOn: ["outcome", "cohort_entry"],
      guidelineItems: { STROBE: ["STROBE-7"] },
      evidenceKinds: [],
    },
    {
      key: "confounders",
      label: "Confounders / covariates",
      help: "Measured confounders and how each is captured in the data.",
      requiredFields: [
        { id: "confounders", label: "Confounders" },
        { id: "measurement", label: "Measurement in data source" },
      ],
      dependsOn: ["exposure", "outcome"],
      guidelineItems: { STROBE: ["STROBE-7"] },
      evidenceKinds: ["confounder"],
    },
    {
      key: "effect_measure",
      label: "Effect measure",
      help: "Effect measure reported (HR, RR, OR, RD…).",
      requiredFields: [{ id: "measure", label: "Effect measure" }],
      dependsOn: ["outcome"],
      guidelineItems: { STROBE: ["STROBE-16"] },
      evidenceKinds: ["outcome"],
    },
    {
      key: "primary_model",
      label: "Primary model",
      help: "Primary analytic model and confounding-control strategy.",
      requiredFields: [
        { id: "model", label: "Model" },
        { id: "adjustment", label: "Confounding control" },
      ],
      dependsOn: ["outcome", "exposure", "confounders", "effect_measure"],
      guidelineItems: { STROBE: ["STROBE-12"] },
      evidenceKinds: [],
    },
    {
      key: "missing_data",
      label: "Missing data",
      help: "Missing-data mechanism assumption and handling strategy.",
      requiredFields: [{ id: "strategy", label: "Missing-data strategy" }],
      dependsOn: ["confounders", "outcome"],
      guidelineItems: { STROBE: ["STROBE-12"] },
      evidenceKinds: [],
    },
    {
      key: "sensitivity_analyses",
      label: "Sensitivity analyses",
      help: "Pre-specified sensitivity analyses (e.g. unmeasured confounding).",
      requiredFields: [{ id: "analyses", label: "Sensitivity analyses" }],
      dependsOn: ["primary_model"],
      guidelineItems: { STROBE: ["STROBE-12"] },
      evidenceKinds: ["bias"],
    },
    {
      key: "subgroup_analyses",
      label: "Subgroup analyses",
      help: "Pre-specified subgroups and rationale.",
      requiredFields: [{ id: "subgroups", label: "Subgroups" }],
      dependsOn: ["primary_model"],
      guidelineItems: { STROBE: ["STROBE-12"] },
      evidenceKinds: ["population"],
    },
    {
      key: "feasibility",
      label: "Feasibility",
      help: "Expected sample size and data availability for key variables.",
      requiredFields: [
        { id: "sample", label: "Expected sample size" },
        { id: "availability", label: "Key-variable availability" },
      ],
      dependsOn: ["data_source", "outcome", "exposure"],
      guidelineItems: {},
      evidenceKinds: ["other"],
    },
    {
      key: "ethics",
      label: "Ethics / privacy",
      help: "IRB/ethics approval and data-privacy basis.",
      requiredFields: [{ id: "basis", label: "Ethics / privacy basis" }],
      dependsOn: [],
      guidelineItems: { RECORD: ["RECORD-12.1"] },
      evidenceKinds: [],
    },
    {
      key: "reporting",
      label: "Reporting / registration",
      help: "Reporting-guideline commitment (STROBE/RECORD) and registration.",
      requiredFields: [{ id: "commitment", label: "Reporting + registration" }],
      dependsOn: [],
      guidelineItems: { STROBE: ["STROBE-1a"], RECORD: ["RECORD-13.1"] },
      evidenceKinds: [],
    },
  ],
};

// --------------------------------------------------------------------------
// Interventional (AI-intervention trial) → SPIRIT-AI (protocol) + CONSORT-AI
// (reporting). The checklist map is scoped to the two AI extensions; the AI
// elaboration items all hang off the `ai_intervention` card so coverage tracks
// how fully the AI intervention is specified.
// --------------------------------------------------------------------------

const TRIAL_SCHEMA: ModeSchema = {
  mode: "interventional",
  label: "AI-intervention trial",
  guidelines: ["SPIRIT-AI", "CONSORT-AI"],
  cards: [
    {
      key: "research_question",
      label: "Research question",
      help: "State the trial question as PICO.",
      requiredFields: [
        { id: "population", label: "Population" },
        { id: "intervention", label: "AI intervention" },
        { id: "comparator", label: "Comparator" },
        { id: "outcome", label: "Primary outcome" },
      ],
      dependsOn: [],
      guidelineItems: {},
      evidenceKinds: ["population", "outcome", "prior_design"],
    },
    {
      key: "eligibility",
      label: "Eligibility criteria",
      help: "Participant inclusion/exclusion plus criteria at the input-data level.",
      requiredFields: [
        { id: "inclusion", label: "Inclusion criteria" },
        { id: "exclusion", label: "Exclusion criteria" },
        { id: "input_eligibility", label: "Input-data eligibility (data the AI accepts)" },
      ],
      dependsOn: ["research_question"],
      guidelineItems: { "SPIRIT-AI": ["SPIRIT-AI-10"], "CONSORT-AI": ["CONSORT-AI-4a"] },
      evidenceKinds: ["population"],
    },
    {
      key: "ai_intervention",
      label: "AI intervention",
      help: "Fully specify the AI intervention per SPIRIT-AI / CONSORT-AI.",
      requiredFields: [
        { id: "model_version", label: "Model type + version" },
        { id: "input_data", label: "Input data: how acquired & quality-assessed" },
        { id: "output", label: "Output of the AI" },
        { id: "human_oversight", label: "Human–AI interaction & required expertise" },
        { id: "error_handling", label: "Handling of poor-quality / unavailable input" },
        { id: "integration", label: "Integration into the care setting" },
      ],
      dependsOn: ["research_question"],
      guidelineItems: {
        "SPIRIT-AI": [
          "SPIRIT-AI-1",
          "SPIRIT-AI-6a",
          "SPIRIT-AI-9",
          "SPIRIT-AI-11ai",
          "SPIRIT-AI-11aii",
          "SPIRIT-AI-11aiii",
          "SPIRIT-AI-11aiv",
          "SPIRIT-AI-11av",
        ],
        "CONSORT-AI": [
          "CONSORT-AI-1a",
          "CONSORT-AI-4b",
          "CONSORT-AI-5i",
          "CONSORT-AI-5ii",
          "CONSORT-AI-5iii",
          "CONSORT-AI-5iv",
          "CONSORT-AI-5v",
          "CONSORT-AI-5vi",
        ],
      },
      evidenceKinds: ["prior_design", "measure", "other"],
    },
    {
      key: "comparator",
      label: "Comparator",
      help: "Comparator arm (usual care vs existing digital education) and co-interventions.",
      requiredFields: [
        { id: "definition", label: "Comparator definition" },
        { id: "co_intervention", label: "Co-intervention handling" },
      ],
      dependsOn: ["ai_intervention"],
      guidelineItems: {},
      evidenceKinds: ["prior_design", "other"],
    },
    {
      key: "randomization",
      label: "Randomization",
      help: "Sequence generation method and allocation ratio.",
      requiredFields: [
        { id: "method", label: "Sequence generation method" },
        { id: "ratio", label: "Allocation ratio" },
      ],
      dependsOn: ["eligibility"],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "allocation_concealment",
      label: "Allocation concealment",
      help: "Mechanism used to conceal the allocation sequence.",
      requiredFields: [{ id: "mechanism", label: "Concealment mechanism" }],
      dependsOn: ["randomization"],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "blinding",
      label: "Blinding",
      help: "Who is blinded after assignment and how.",
      requiredFields: [{ id: "who_blinded", label: "Who is blinded (participants/providers/assessors)" }],
      dependsOn: ["randomization"],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "primary_outcome",
      label: "Primary outcome",
      help: "Primary outcome, measurement timepoint, and metric.",
      requiredFields: [
        { id: "outcome", label: "Primary outcome" },
        { id: "timepoint", label: "Measurement timepoint" },
        { id: "metric", label: "Analysis metric" },
      ],
      dependsOn: ["research_question"],
      guidelineItems: {},
      evidenceKinds: ["outcome", "measure"],
    },
    {
      key: "secondary_outcomes",
      label: "Secondary outcomes",
      help: "Pre-specified secondary outcomes.",
      requiredFields: [{ id: "outcomes", label: "Secondary outcomes" }],
      dependsOn: ["primary_outcome"],
      guidelineItems: {},
      evidenceKinds: ["outcome"],
    },
    {
      key: "sample_size",
      label: "Sample size",
      help: "Target sample size with clinical and statistical assumptions.",
      requiredFields: [
        { id: "target_n", label: "Target N" },
        { id: "assumptions", label: "Power / effect-size assumptions" },
      ],
      dependsOn: ["primary_outcome"],
      guidelineItems: {},
      evidenceKinds: ["outcome", "other"],
    },
    {
      key: "analysis_plan",
      label: "Statistical analysis plan",
      help: "Primary analysis model and any analysis of AI performance errors.",
      requiredFields: [
        { id: "primary_analysis", label: "Primary analysis model" },
        { id: "error_analysis", label: "Analysis of AI performance errors" },
      ],
      dependsOn: ["primary_outcome", "sample_size"],
      guidelineItems: { "SPIRIT-AI": ["SPIRIT-AI-22"], "CONSORT-AI": ["CONSORT-AI-19"] },
      evidenceKinds: [],
    },
    {
      key: "missing_data",
      label: "Missing data",
      help: "Missing-data assumption and handling strategy.",
      requiredFields: [{ id: "strategy", label: "Missing-data strategy" }],
      dependsOn: ["analysis_plan"],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "ethics_consent",
      label: "Ethics & consent",
      help: "IRB/ethics approval plan and informed-consent procedure.",
      requiredFields: [
        { id: "ethics_basis", label: "Ethics / IRB basis" },
        { id: "consent", label: "Informed-consent procedure" },
      ],
      dependsOn: [],
      guidelineItems: {},
      evidenceKinds: [],
    },
    {
      key: "registration",
      label: "Registration & code availability",
      help: "Trial registry plus whether/how the AI intervention and code can be accessed.",
      requiredFields: [
        { id: "registry", label: "Registry + ID (or planned)" },
        { id: "code_availability", label: "AI/code access & restrictions" },
      ],
      dependsOn: [],
      guidelineItems: { "CONSORT-AI": ["CONSORT-AI-25"] },
      evidenceKinds: [],
    },
  ],
};

// --------------------------------------------------------------------------
// Scoping review → PRISMA-ScR. PCC framing (Population / Concept / Context)
// instead of PICO; no mandatory risk-of-bias / effect-measure synthesis. The
// search yields and the screened-record corpus live in review_searches /
// review_records (populated by CSV import); these cards capture the design
// decisions those data realize.
// --------------------------------------------------------------------------

const SCOPING_SCHEMA: ModeSchema = {
  mode: "scoping_review",
  label: "Scoping review",
  guidelines: ["PRISMA-ScR"],
  cards: [
    {
      key: "review_question",
      label: "Review question & objectives",
      help: "State the objective(s) using the PCC frame.",
      requiredFields: [
        { id: "population", label: "Population" },
        { id: "concept", label: "Concept" },
        { id: "context", label: "Context" },
      ],
      dependsOn: [],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-4"] },
      evidenceKinds: ["population", "other"],
    },
    {
      key: "eligibility_criteria",
      label: "Eligibility criteria",
      help: "Inclusion/exclusion criteria, including eligible sources/evidence types.",
      requiredFields: [
        { id: "inclusion", label: "Inclusion criteria" },
        { id: "exclusion", label: "Exclusion criteria" },
        { id: "sources", label: "Eligible source / evidence types" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-6"] },
      evidenceKinds: ["population", "prior_design"],
    },
    {
      key: "information_sources",
      label: "Information sources",
      help: "Databases / registers / grey-literature sources and the last search date.",
      requiredFields: [
        { id: "databases", label: "Databases / sources" },
        { id: "date", label: "Search / last-search date" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-7"] },
      evidenceKinds: ["other"],
    },
    {
      key: "search_strategy",
      label: "Search strategy",
      help: "Full search strategy for each database (imported from the search CSV).",
      requiredFields: [
        { id: "strategy", label: "Search strategy / concept blocks" },
        { id: "limits", label: "Language / date limits + justification" },
      ],
      dependsOn: ["review_question", "eligibility_criteria", "information_sources"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-8"] },
      evidenceKinds: ["other"],
    },
    {
      key: "selection_process",
      label: "Selection of sources",
      help: "How records are screened (independent duplication, conflict resolution).",
      requiredFields: [
        { id: "process", label: "Screening process" },
        { id: "reviewers", label: "Number of reviewers / duplication" },
      ],
      dependsOn: ["eligibility_criteria"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-9", "PRISMA-ScR-14"] },
      evidenceKinds: [],
    },
    {
      key: "data_charting",
      label: "Data charting",
      help: "What is charted from each source and how (the charting form / data items).",
      requiredFields: [
        { id: "items", label: "Data items to chart" },
        { id: "process", label: "Charting process (duplication, iterative)" },
      ],
      dependsOn: ["review_question"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-10", "PRISMA-ScR-11", "PRISMA-ScR-15"] },
      evidenceKinds: ["measure", "outcome", "other"],
    },
    {
      key: "synthesis",
      label: "Synthesis & presentation",
      help: "How charted results are summarized and presented (mapping, narrative, tables).",
      requiredFields: [
        { id: "approach", label: "Synthesis / presentation approach" },
      ],
      dependsOn: ["data_charting"],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-13", "PRISMA-ScR-18", "PRISMA-ScR-20"] },
      evidenceKinds: [],
    },
    {
      key: "registration",
      label: "Registration & protocol",
      help: "Protocol availability and registration (e.g. OSF) plus reporting commitment.",
      requiredFields: [
        { id: "registry", label: "Protocol / registration (or planned)" },
      ],
      dependsOn: [],
      guidelineItems: { "PRISMA-ScR": ["PRISMA-ScR-5"] },
      evidenceKinds: [],
    },
  ],
};

const SCHEMAS: Record<StudyMode, ModeSchema> = {
  systematic_review: SR_SCHEMA,
  scoping_review: SCOPING_SCHEMA,
  retrospective_observational: OBS_SCHEMA,
  interventional: TRIAL_SCHEMA,
};

// Ordered design stages per mode — used by the UI to group the canvas into a
// guided flow instead of a flat list. Every card key must appear in exactly
// one stage.
export interface StageGroup {
  label: string;
  cards: string[];
}

const STAGE_GROUPS: Record<StudyMode, StageGroup[]> = {
  systematic_review: [
    { label: "Question & scope", cards: ["review_question", "eligibility_criteria"] },
    { label: "Search", cards: ["information_sources", "search_strategy"] },
    {
      label: "Selection & data",
      cards: ["screening_process", "data_extraction", "risk_of_bias"],
    },
    {
      label: "Synthesis",
      cards: [
        "effect_measure",
        "synthesis_plan",
        "heterogeneity",
        "subgroup_analyses",
        "sensitivity_analyses",
        "certainty",
      ],
    },
    { label: "Registration", cards: ["registration"] },
  ],
  scoping_review: [
    { label: "Question & scope", cards: ["review_question", "eligibility_criteria"] },
    { label: "Search", cards: ["information_sources", "search_strategy"] },
    { label: "Selection & charting", cards: ["selection_process", "data_charting"] },
    { label: "Synthesis", cards: ["synthesis"] },
    { label: "Registration", cards: ["registration"] },
  ],
  retrospective_observational: [
    { label: "Question & data source", cards: ["clinical_question", "data_source"] },
    {
      label: "Cohort definition",
      cards: ["target_population", "cohort_entry", "eligibility"],
    },
    {
      label: "Exposure & outcome",
      cards: ["exposure", "comparator", "outcome", "follow_up", "confounders"],
    },
    {
      label: "Analysis plan",
      cards: [
        "effect_measure",
        "primary_model",
        "missing_data",
        "sensitivity_analyses",
        "subgroup_analyses",
      ],
    },
    { label: "Feasibility & reporting", cards: ["feasibility", "ethics", "reporting"] },
  ],
  interventional: [
    { label: "Question & eligibility", cards: ["research_question", "eligibility"] },
    { label: "Intervention & comparator", cards: ["ai_intervention", "comparator"] },
    {
      label: "Randomization & blinding",
      cards: ["randomization", "allocation_concealment", "blinding"],
    },
    { label: "Outcomes", cards: ["primary_outcome", "secondary_outcomes"] },
    { label: "Analysis", cards: ["sample_size", "analysis_plan", "missing_data"] },
    { label: "Ethics & registration", cards: ["ethics_consent", "registration"] },
  ],
};

export function getStageGroups(mode: StudyMode): StageGroup[] {
  return STAGE_GROUPS[mode];
}

export function getCardStage(mode: StudyMode, cardType: string): string {
  for (const g of STAGE_GROUPS[mode]) {
    if (g.cards.includes(cardType)) return g.label;
  }
  return "Other";
}

export function getModeSchema(mode: StudyMode): ModeSchema {
  return SCHEMAS[mode];
}

export function getCardDef(
  mode: StudyMode,
  cardType: string,
): CardDef | undefined {
  return SCHEMAS[mode].cards.find((c) => c.key === cardType);
}

/** Cards that declare `cardType` as a prerequisite — i.e. those that go stale
 * when `cardType` changes. */
export function downstreamCards(mode: StudyMode, cardType: string): string[] {
  return SCHEMAS[mode].cards
    .filter((c) => c.dependsOn.includes(cardType))
    .map((c) => c.key);
}

export function allCardKeys(mode: StudyMode): string[] {
  return SCHEMAS[mode].cards.map((c) => c.key);
}
