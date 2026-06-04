import type {
  GuidelineItem,
  GuidelineTemplate,
  ReportingChecklistSubjectType,
  ReportingGuideline,
  StudyDesign,
} from "./types";

// Concise representative item sets per guideline. Coverage is intentionally
// not exhaustive — the goal is the most commonly-missed items so the agent
// has a starting checklist to map against. Extend per-guideline as needed.

const PRISMA_ITEMS: GuidelineItem[] = [
  { item_key: "PRISMA-1", section: "Title", prompt: "Identify the report as a systematic review.", detect_regex: /\bsystematic review\b/i },
  { item_key: "PRISMA-2", section: "Abstract", prompt: "Structured summary including objectives, data sources, eligibility criteria, study selection, synthesis methods, results, limitations, and registration." },
  { item_key: "PRISMA-3", section: "Introduction", prompt: "Rationale for the review." },
  { item_key: "PRISMA-4", section: "Introduction", prompt: "Explicit, answerable objectives (PICO)." },
  { item_key: "PRISMA-5", section: "Methods", prompt: "Eligibility criteria including study characteristics and report characteristics.", detect_regex: /eligibility criteria|inclusion criteria/i },
  { item_key: "PRISMA-7", section: "Methods", prompt: "Search strategy with full electronic search of at least one database including dates and limits.", detect_regex: /search\s+strategy/i },
  { item_key: "PRISMA-12", section: "Methods", prompt: "Risk-of-bias assessment method for individual studies.", detect_regex: /risk of bias/i },
  { item_key: "PRISMA-14", section: "Methods", prompt: "Synthesis methods including measures of consistency (I²) where applicable." },
  { item_key: "PRISMA-17", section: "Results", prompt: "Flow diagram of study selection (PRISMA flow)." },
  { item_key: "PRISMA-24", section: "Results", prompt: "Risk of bias across studies." },
  { item_key: "PRISMA-27", section: "Funding", prompt: "Funding sources and role of funders." },
];

const PRISMA_P_ITEMS: GuidelineItem[] = [
  { item_key: "PRISMA-P-1a", section: "Administrative", prompt: "Identify the report as a protocol of a systematic review." },
  { item_key: "PRISMA-P-3", section: "Administrative", prompt: "Indicate registration (e.g., PROSPERO) including registration number.", detect_regex: /prospero|registered/i },
  { item_key: "PRISMA-P-9", section: "Methods", prompt: "Pre-specified eligibility criteria (PICO + study designs)." },
  { item_key: "PRISMA-P-10", section: "Methods", prompt: "Information sources to be searched with planned dates." },
  { item_key: "PRISMA-P-12", section: "Methods", prompt: "Process for selecting studies (screening, full text)." },
  { item_key: "PRISMA-P-13", section: "Methods", prompt: "Data extraction methods including independent duplication." },
  { item_key: "PRISMA-P-14", section: "Methods", prompt: "Risk-of-bias assessment plan for individual studies." },
  { item_key: "PRISMA-P-15", section: "Methods", prompt: "Planned synthesis approach (narrative vs meta-analysis) and rationale." },
];

const STROBE_ITEMS: GuidelineItem[] = [
  { item_key: "STROBE-1a", section: "Title/Abstract", prompt: "Indicate the study's design in the title or abstract." },
  { item_key: "STROBE-1b", section: "Title/Abstract", prompt: "Informative, balanced summary in the abstract." },
  { item_key: "STROBE-3", section: "Introduction", prompt: "State specific objectives, including pre-specified hypotheses." },
  { item_key: "STROBE-4", section: "Methods", prompt: "Present key elements of study design early in the paper.", detect_regex: /\b(cohort|case-control|cross-sectional)\b/i },
  { item_key: "STROBE-6", section: "Methods", prompt: "Eligibility criteria, sources, methods of selection.", detect_regex: /eligibility|inclusion criteria/i },
  { item_key: "STROBE-7", section: "Methods", prompt: "Clearly define outcomes, exposures, predictors, confounders, effect modifiers." },
  { item_key: "STROBE-10", section: "Methods", prompt: "Explain how the study size was arrived at.", detect_regex: /sample\s*size|power/i },
  { item_key: "STROBE-12", section: "Methods", prompt: "Describe all statistical methods including those used to control for confounding." },
  { item_key: "STROBE-13", section: "Results", prompt: "Numbers of participants at each stage; flow diagram encouraged." },
  { item_key: "STROBE-16", section: "Results", prompt: "Report unadjusted and confounder-adjusted estimates with precision (95% CI).", detect_regex: /95\s*%\s*ci|confidence interval/i },
  { item_key: "STROBE-19", section: "Discussion", prompt: "Discuss limitations, including sources of bias.", detect_regex: /limitations?/i },
  { item_key: "STROBE-22", section: "Other", prompt: "Funding source and role of funders." },
];

const CONSORT_ITEMS: GuidelineItem[] = [
  { item_key: "CONSORT-1a", section: "Title", prompt: "Identification as a randomized trial in the title.", detect_regex: /randomi[sz]ed/i },
  { item_key: "CONSORT-3a", section: "Trial design", prompt: "Description of trial design (parallel, factorial, crossover) with allocation ratio." },
  { item_key: "CONSORT-4a", section: "Participants", prompt: "Eligibility criteria for participants." },
  { item_key: "CONSORT-5", section: "Interventions", prompt: "Interventions for each group with detail to allow replication." },
  { item_key: "CONSORT-6a", section: "Outcomes", prompt: "Completely defined pre-specified primary and secondary outcome measures." },
  { item_key: "CONSORT-7a", section: "Sample size", prompt: "How sample size was determined.", detect_regex: /sample\s*size|power/i },
  { item_key: "CONSORT-8a", section: "Randomisation", prompt: "Method used to generate the random allocation sequence." },
  { item_key: "CONSORT-9", section: "Allocation", prompt: "Mechanism to implement the allocation sequence (concealment)." },
  { item_key: "CONSORT-11a", section: "Blinding", prompt: "If done, who was blinded after assignment (participants, providers, assessors) and how." },
  { item_key: "CONSORT-13a", section: "Flow", prompt: "Flow diagram showing numbers randomized, receiving intended treatment, analysed." },
  { item_key: "CONSORT-17a", section: "Outcomes/estimation", prompt: "For each outcome, results for each group with estimated effect size and 95% CI." },
  { item_key: "CONSORT-23", section: "Registration", prompt: "Registration number and name of trial registry.", detect_regex: /nct\d+|clinicaltrials\.gov|registered/i },
  { item_key: "CONSORT-24", section: "Protocol", prompt: "Where the full trial protocol can be accessed." },
];

// CONSORT-AI (2020) extends CONSORT for trials of interventions involving AI.
// Item keys follow the extension numbering (5i…5vi for the intervention
// elaboration) and are referenced by the interventional card schema.
const CONSORT_AI_ITEMS: GuidelineItem[] = [
  { item_key: "CONSORT-AI-1a", section: "Title/Abstract", prompt: "Indicate that the intervention involves artificial intelligence/machine learning and specify the type of model." },
  { item_key: "CONSORT-AI-4a", section: "Participants", prompt: "State the inclusion and exclusion criteria at the level of the input data." },
  { item_key: "CONSORT-AI-4b", section: "Participants", prompt: "Describe how the AI intervention was integrated into the trial setting, including any onsite or offsite requirements." },
  { item_key: "CONSORT-AI-5i", section: "Interventions", prompt: "State which version of the AI algorithm was used." },
  { item_key: "CONSORT-AI-5ii", section: "Interventions", prompt: "Describe how the input data were acquired and selected for the AI intervention." },
  { item_key: "CONSORT-AI-5iii", section: "Interventions", prompt: "Describe how poor-quality or unavailable input data were assessed and handled." },
  { item_key: "CONSORT-AI-5iv", section: "Interventions", prompt: "Specify whether there was human–AI interaction in the handling of input data, and the level of expertise required of users." },
  { item_key: "CONSORT-AI-5v", section: "Interventions", prompt: "Specify the output of the AI intervention." },
  { item_key: "CONSORT-AI-5vi", section: "Interventions", prompt: "Explain how the AI intervention's outputs contributed to decision-making or other elements of clinical practice." },
  { item_key: "CONSORT-AI-19", section: "Harms", prompt: "Describe results of any analysis of performance errors and how errors were identified; state if no such analysis was planned or done." },
  { item_key: "CONSORT-AI-25", section: "Other", prompt: "State whether and how the AI intervention and/or its code can be accessed, including any restrictions on access or re-use.", detect_regex: /\b(source\s+code|code\s+(?:is|are|will be)?\s*available|repository|github|open[-\s]?source)\b/i },
];

const SPIRIT_ITEMS: GuidelineItem[] = [
  { item_key: "SPIRIT-1", section: "Title", prompt: "Descriptive title identifying study design, population, interventions." },
  { item_key: "SPIRIT-2a", section: "Registration", prompt: "Trial identifier and registry name.", detect_regex: /nct\d+|registered/i },
  { item_key: "SPIRIT-6a", section: "Background", prompt: "Description and rationale for choice of comparator." },
  { item_key: "SPIRIT-7", section: "Objectives", prompt: "Specific objectives or hypotheses." },
  { item_key: "SPIRIT-8", section: "Trial design", prompt: "Description of design including type (e.g., parallel) and allocation ratio." },
  { item_key: "SPIRIT-10", section: "Eligibility", prompt: "Inclusion and exclusion criteria for participants." },
  { item_key: "SPIRIT-11a", section: "Interventions", prompt: "Interventions with sufficient detail to allow replication." },
  { item_key: "SPIRIT-12", section: "Outcomes", prompt: "Primary, secondary, other outcomes including specific measurement variable, analysis metric, method of aggregation, timing." },
  { item_key: "SPIRIT-14", section: "Sample size", prompt: "Estimated number of participants with rationale; clinical and statistical assumptions." },
  { item_key: "SPIRIT-16a", section: "Allocation", prompt: "Sequence generation method." },
  { item_key: "SPIRIT-17a", section: "Blinding", prompt: "Who will be blinded after assignment." },
  { item_key: "SPIRIT-20a", section: "Analytical methods", prompt: "Statistical methods for analysing primary and secondary outcomes." },
  { item_key: "SPIRIT-22", section: "Data monitoring", prompt: "Composition of DMC and whether it is independent." },
  { item_key: "SPIRIT-24", section: "Ethics", prompt: "Plans for IRB/ethics committee approval.", detect_regex: /IRB|ethics committee/i },
  { item_key: "SPIRIT-26a", section: "Consent", prompt: "Procedures for seeking informed consent." },
  { item_key: "SPIRIT-31a", section: "Dissemination", prompt: "Plans for communicating trial results." },
];

// SPIRIT-AI (2020) extends SPIRIT for protocols of trials of interventions
// involving AI. Item keys mirror the SPIRIT-AI elaboration (11a i…vi for the
// intervention description) and are referenced by the interventional card schema.
const SPIRIT_AI_ITEMS: GuidelineItem[] = [
  { item_key: "SPIRIT-AI-1", section: "Title", prompt: "Indicate that the intervention involves artificial intelligence/machine learning and specify the type of model." },
  { item_key: "SPIRIT-AI-6a", section: "Background", prompt: "Explain the intended use of the AI intervention within the clinical pathway, including its purpose and intended users." },
  { item_key: "SPIRIT-AI-9", section: "Setting", prompt: "Describe the onsite or offsite setting in which the AI intervention will be deployed." },
  { item_key: "SPIRIT-AI-10", section: "Eligibility", prompt: "State the inclusion and exclusion criteria at the level of the input data." },
  { item_key: "SPIRIT-AI-11ai", section: "Interventions", prompt: "State which version of the AI algorithm will be used." },
  { item_key: "SPIRIT-AI-11aii", section: "Interventions", prompt: "Describe how the input data will be acquired and selected for the AI intervention." },
  { item_key: "SPIRIT-AI-11aiii", section: "Interventions", prompt: "Describe how poor-quality or unavailable input data will be assessed and handled." },
  { item_key: "SPIRIT-AI-11aiv", section: "Interventions", prompt: "Specify whether there will be human–AI interaction in the handling of input data, and the level of expertise required of users." },
  { item_key: "SPIRIT-AI-11av", section: "Interventions", prompt: "Specify the output of the AI intervention and how it will contribute to decision-making." },
  { item_key: "SPIRIT-AI-22", section: "Monitoring", prompt: "Describe any plans to identify and analyse performance errors of the AI intervention." },
];

const STARD_ITEMS: GuidelineItem[] = [
  { item_key: "STARD-1", section: "Title/Abstract", prompt: "Identification as a study of diagnostic accuracy using sensitivity, specificity, predictive values." },
  { item_key: "STARD-5", section: "Methods", prompt: "Whether data collection was planned before the index test and reference standard (prospective vs retrospective)." },
  { item_key: "STARD-6", section: "Methods", prompt: "Eligibility criteria for participants." },
  { item_key: "STARD-7", section: "Methods", prompt: "On what basis potentially eligible participants were identified." },
  { item_key: "STARD-10a", section: "Index test", prompt: "Index test, in sufficient detail to allow replication." },
  { item_key: "STARD-11", section: "Reference standard", prompt: "Reference standard, in sufficient detail to allow replication." },
  { item_key: "STARD-13a", section: "Analysis", prompt: "Methods for estimating or comparing measures of diagnostic accuracy." },
  { item_key: "STARD-14", section: "Analysis", prompt: "How indeterminate index test or reference standard results were handled." },
  { item_key: "STARD-17", section: "Results", prompt: "Cross-tabulation of index test results by results of reference standard." },
];

const TRIPOD_ITEMS: GuidelineItem[] = [
  { item_key: "TRIPOD-1", section: "Title", prompt: "Identify development/validation of prediction model, target population, and outcome." },
  { item_key: "TRIPOD-4a", section: "Source of data", prompt: "Describe the study design or source of data." },
  { item_key: "TRIPOD-5a", section: "Participants", prompt: "Specify key elements of the study setting and eligibility criteria." },
  { item_key: "TRIPOD-6a", section: "Outcome", prompt: "Clearly define the outcome predicted." },
  { item_key: "TRIPOD-7a", section: "Predictors", prompt: "Clearly define all predictors used in developing the model, including measurement timing." },
  { item_key: "TRIPOD-8", section: "Sample size", prompt: "Explain how the study size was arrived at (events-per-variable rationale).", detect_regex: /sample\s*size|events per/i },
  { item_key: "TRIPOD-9", section: "Missing data", prompt: "Describe handling of missing data (e.g., complete-case, multiple imputation)." },
  { item_key: "TRIPOD-10b", section: "Statistical analysis", prompt: "Specify type of model, all model-building procedures, and method of internal validation." },
  { item_key: "TRIPOD-16", section: "Performance", prompt: "Report performance measures (discrimination and calibration) with confidence intervals." },
];

const CARE_ITEMS: GuidelineItem[] = [
  { item_key: "CARE-1", section: "Title", prompt: "Word 'Case Report' should be in the title with the focus area." },
  { item_key: "CARE-3", section: "Abstract", prompt: "Abstract including introduction, main symptoms, diagnoses/interventions/outcomes, conclusion." },
  { item_key: "CARE-5a", section: "Patient information", prompt: "De-identified patient-specific information." },
  { item_key: "CARE-6", section: "Clinical findings", prompt: "Describe significant clinical findings." },
  { item_key: "CARE-7", section: "Timeline", prompt: "Organize key events into a timeline." },
  { item_key: "CARE-9", section: "Therapeutic intervention", prompt: "Type of intervention; dosage; duration; changes; adherence; tolerability." },
  { item_key: "CARE-10a", section: "Follow-up", prompt: "Clinician- and patient-assessed outcomes." },
  { item_key: "CARE-12", section: "Patient perspective", prompt: "Patient should share their perspective when appropriate." },
  { item_key: "CARE-13", section: "Informed consent", prompt: "Did the patient give informed consent? Provide as needed." },
];

const SRQR_ITEMS: GuidelineItem[] = [
  { item_key: "SRQR-1", section: "Title", prompt: "Concise description identifying the study as qualitative." },
  { item_key: "SRQR-4", section: "Problem formulation", prompt: "Description and significance of the problem/phenomenon studied." },
  { item_key: "SRQR-5", section: "Purpose", prompt: "Research goals and questions." },
  { item_key: "SRQR-7", section: "Researcher characteristics", prompt: "Researchers' characteristics that may influence the research (e.g., reflexivity)." },
  { item_key: "SRQR-9", section: "Sampling strategy", prompt: "How and why participants/settings were selected." },
  { item_key: "SRQR-12", section: "Data collection", prompt: "Types of data collected, details of data collection procedures." },
  { item_key: "SRQR-14", section: "Data analysis", prompt: "Process by which inferences, themes, etc., were identified and developed." },
  { item_key: "SRQR-16", section: "Trustworthiness", prompt: "Techniques to enhance trustworthiness (e.g., member checking, triangulation)." },
];

const COREQ_ITEMS: GuidelineItem[] = [
  { item_key: "COREQ-1", section: "Research team", prompt: "Interviewer/facilitator characteristics and credentials." },
  { item_key: "COREQ-7", section: "Sampling", prompt: "How participants were selected (purposive, convenience, snowball)." },
  { item_key: "COREQ-10", section: "Sample size", prompt: "Number of participants." },
  { item_key: "COREQ-15", section: "Setting", prompt: "Setting of data collection." },
  { item_key: "COREQ-19", section: "Recording", prompt: "Whether audio/visual recording was used." },
  { item_key: "COREQ-20", section: "Field notes", prompt: "Were field notes made during/after interview?" },
  { item_key: "COREQ-22", section: "Data saturation", prompt: "Whether data saturation was discussed." },
  { item_key: "COREQ-24", section: "Coding", prompt: "Number of data coders and any coding tree." },
  { item_key: "COREQ-30", section: "Quotations", prompt: "Were participant quotations presented to illustrate themes?" },
];

const ARRIVE_ITEMS: GuidelineItem[] = [
  { item_key: "ARRIVE-1", section: "Study design", prompt: "Groups being compared including control, and experimental unit." },
  { item_key: "ARRIVE-2", section: "Sample size", prompt: "Specify exact number of experimental units; explain how decided.", detect_regex: /sample\s*size|power/i },
  { item_key: "ARRIVE-3", section: "Inclusion/exclusion", prompt: "Inclusion and exclusion criteria for animals, experimental units, data points." },
  { item_key: "ARRIVE-4", section: "Randomisation", prompt: "If randomization was used, state the method used." },
  { item_key: "ARRIVE-5", section: "Blinding", prompt: "If blinding/masking was used, who was blinded and at what stage." },
  { item_key: "ARRIVE-6", section: "Outcome measures", prompt: "Clearly define all outcome measures assessed." },
  { item_key: "ARRIVE-7", section: "Statistical methods", prompt: "Statistical methods used for each analysis." },
  { item_key: "ARRIVE-8", section: "Experimental animals", prompt: "Species, strain, sex, age/developmental stage, weight." },
  { item_key: "ARRIVE-9", section: "Experimental procedures", prompt: "Detail to permit replication: what, when, where, how, why." },
  { item_key: "ARRIVE-15", section: "Ethics", prompt: "Ethical review and licences." },
];

// RECORD extends STROBE for studies using routinely-collected health data
// (administrative data, EHRs, registries). Item keys follow the RECORD
// numbering (e.g. RECORD-1.1) and are referenced by the observational card
// schema in methods/cardSchema.ts.
const RECORD_ITEMS: GuidelineItem[] = [
  { item_key: "RECORD-1.1", section: "Title/Abstract", prompt: "Indicate the type of data used and the database(s) accessed." },
  { item_key: "RECORD-6.1", section: "Participants", prompt: "Detail the methods of study population selection (codes/algorithms used to define the population)." },
  { item_key: "RECORD-6.2", section: "Participants", prompt: "Provide a validation of the codes/algorithms used to select the population, if done." },
  { item_key: "RECORD-7.1", section: "Variables", prompt: "Provide a complete list of codes and algorithms used to classify exposures, outcomes, confounders, and effect modifiers." },
  { item_key: "RECORD-12.1", section: "Data access/cleaning", prompt: "Describe the extent to which investigators had access to the database population, and the data-cleaning methods used." },
  { item_key: "RECORD-13.1", section: "Linkage", prompt: "State whether the study included person-level, institutional-level, or other linkage across two or more databases, and the methods of linkage." },
];

// `subject_type` says whether the guideline applies to a protocol or a
// manuscript. SPIRIT and PRISMA-P are protocol-side; the rest are
// manuscript-side. `required_for` lets the seeder pick guidelines based on
// study_design (used in the UI to suggest defaults).

export const GUIDELINES: Record<ReportingGuideline, GuidelineTemplate> = {
  PRISMA: {
    id: "PRISMA",
    version: "2020",
    subject_type: "manuscript",
    source_url: "https://www.prisma-statement.org",
    items: PRISMA_ITEMS,
  },
  "PRISMA-P": {
    id: "PRISMA-P",
    version: "2015",
    subject_type: "protocol",
    source_url: "https://www.equator-network.org/reporting-guidelines/prisma-protocols/",
    items: PRISMA_P_ITEMS,
  },
  STROBE: {
    id: "STROBE",
    version: "2007",
    subject_type: "manuscript",
    source_url: "https://www.strobe-statement.org",
    items: STROBE_ITEMS,
  },
  CONSORT: {
    id: "CONSORT",
    version: "2010",
    subject_type: "manuscript",
    source_url: "http://www.consort-statement.org",
    items: CONSORT_ITEMS,
  },
  SPIRIT: {
    id: "SPIRIT",
    version: "2013",
    subject_type: "protocol",
    source_url: "https://www.spirit-statement.org",
    items: SPIRIT_ITEMS,
  },
  STARD: {
    id: "STARD",
    version: "2015",
    subject_type: "manuscript",
    source_url: "https://www.equator-network.org/reporting-guidelines/stard/",
    items: STARD_ITEMS,
  },
  TRIPOD: {
    id: "TRIPOD",
    version: "2015",
    subject_type: "manuscript",
    source_url: "https://www.tripod-statement.org",
    items: TRIPOD_ITEMS,
  },
  CARE: {
    id: "CARE",
    version: "2016",
    subject_type: "manuscript",
    source_url: "https://www.care-statement.org",
    items: CARE_ITEMS,
  },
  SRQR: {
    id: "SRQR",
    version: "2014",
    subject_type: "manuscript",
    source_url: "https://www.equator-network.org/reporting-guidelines/srqr/",
    items: SRQR_ITEMS,
  },
  COREQ: {
    id: "COREQ",
    version: "2007",
    subject_type: "manuscript",
    source_url: "https://www.equator-network.org/reporting-guidelines/coreq/",
    items: COREQ_ITEMS,
  },
  ARRIVE: {
    id: "ARRIVE",
    version: "2.0",
    subject_type: "manuscript",
    source_url: "https://arriveguidelines.org",
    items: ARRIVE_ITEMS,
  },
  RECORD: {
    id: "RECORD",
    version: "2015",
    subject_type: "manuscript",
    source_url: "https://www.record-statement.org",
    items: RECORD_ITEMS,
  },
  "SPIRIT-AI": {
    id: "SPIRIT-AI",
    version: "2020",
    subject_type: "protocol",
    source_url: "https://www.spirit-statement.org/spirit-ai/",
    items: SPIRIT_AI_ITEMS,
  },
  "CONSORT-AI": {
    id: "CONSORT-AI",
    version: "2020",
    subject_type: "manuscript",
    source_url: "https://www.consort-statement.org/extensions/overview/2020-consort-ai",
    items: CONSORT_AI_ITEMS,
  },
};

export function getChecklistTemplate(
  guideline: ReportingGuideline,
): GuidelineTemplate {
  return GUIDELINES[guideline];
}

/** Suggest applicable guidelines for the given subject (protocol or manuscript)
 * and optional study design. Returns guidelines whose subject_type matches and
 * whose required_for either includes the design or is unspecified. */
export function suggestGuidelines(
  subjectType: ReportingChecklistSubjectType,
  studyDesign?: StudyDesign | string | null,
): ReportingGuideline[] {
  const out: ReportingGuideline[] = [];
  for (const tpl of Object.values(GUIDELINES)) {
    if (tpl.subject_type !== subjectType) continue;
    if (subjectType === "protocol") {
      if (studyDesign === "systematic_review" || studyDesign === "scoping_review") {
        if (tpl.id === "PRISMA-P") out.push(tpl.id);
      } else if (studyDesign === "rct") {
        if (tpl.id === "SPIRIT-AI" || tpl.id === "SPIRIT") out.push(tpl.id);
      } else {
        if (tpl.id === "SPIRIT") out.push(tpl.id);
      }
      continue;
    }
    // manuscript
    switch (studyDesign) {
      case "rct":
        if (tpl.id === "CONSORT-AI" || tpl.id === "CONSORT") out.push(tpl.id);
        break;
      case "cohort":
      case "case_control":
      case "cross_sectional":
        if (tpl.id === "STROBE") out.push(tpl.id);
        break;
      case "systematic_review":
      case "scoping_review":
        if (tpl.id === "PRISMA") out.push(tpl.id);
        break;
      case "diagnostic_accuracy":
        if (tpl.id === "STARD") out.push(tpl.id);
        break;
      case "prediction_model":
        if (tpl.id === "TRIPOD") out.push(tpl.id);
        break;
      case "case_report":
        if (tpl.id === "CARE") out.push(tpl.id);
        break;
      case "qualitative":
        if (tpl.id === "SRQR" || tpl.id === "COREQ") out.push(tpl.id);
        break;
      case "animal_study":
        if (tpl.id === "ARRIVE") out.push(tpl.id);
        break;
      default:
        // Unknown / not supplied — surface STROBE and PRISMA as common defaults.
        if (tpl.id === "STROBE" || tpl.id === "PRISMA") out.push(tpl.id);
    }
  }
  return out;
}
