/**
 * Plain-language labels and one-line explanations for every machine term the
 * Methods Workbench shows a researcher. Single source of truth for human copy;
 * visual styling stays in src/lib/styles.ts.
 *
 * Client-safe: no server imports.
 */

export interface TermInfo {
  label: string;
  explain: string;
}

// ---------------------------------------------------------------------------
// Decision-card lifecycle states (src/server/types.ts DecisionState)
// ---------------------------------------------------------------------------

export const DECISION_STATE_INFO: Record<string, TermInfo> = {
  not_started: {
    label: "not started",
    explain: "Nothing entered yet — open the card and type, or ask for options.",
  },
  drafted: {
    label: "drafted",
    explain: "You wrote a value. It counts toward readiness but isn't final.",
  },
  underspecified: {
    label: "needs detail",
    explain: "A value exists, but required sub-fields are still empty.",
  },
  conflicting: {
    label: "conflicting",
    explain: "This decision contradicts another card — see the Checks panel.",
  },
  evidence_supported: {
    label: "evidence-backed",
    explain: "This decision has linked evidence items supporting it.",
  },
  needs_input: {
    label: "open question",
    explain: "You marked a question someone must answer before deciding.",
  },
  unknown: {
    label: "unknown",
    explain: "Explicitly marked as not yet knowable — better than guessing.",
  },
  assumed: {
    label: "working assumption",
    explain: "Filled in without evidence — revisit before you finalize.",
  },
  locked: {
    label: "locked",
    explain: "Finalized. Locked decisions won't change until you unlock them.",
  },
};

// ---------------------------------------------------------------------------
// Severities
// ---------------------------------------------------------------------------

export const PREFLIGHT_SEVERITY_INFO: Record<string, TermInfo> = {
  blocking: {
    label: "blocking",
    explain: "Fix this before the design can compile into a complete protocol.",
  },
  important: {
    label: "important",
    explain: "A real methodological weakness — address it, or note why not.",
  },
  minor: {
    label: "minor",
    explain: "Worth tidying, but it won't undermine the design.",
  },
};

export const READINESS_SEVERITY_INFO: Record<string, TermInfo> = {
  critical: {
    label: "critical",
    explain: "Likely to cause desk rejection or a major reviewer objection.",
  },
  major: {
    label: "major",
    explain: "Reviewers will probably flag this — fix before submitting.",
  },
  minor: {
    label: "minor",
    explain: "Small polish item; unlikely to block acceptance on its own.",
  },
};

// ---------------------------------------------------------------------------
// Readiness gates (src/server/readinessChecks.ts) — deterministic scans plus
// protocol-vs-manuscript comparison. The agent may invent new gate keys, so
// always go through gateInfo() which humanizes unknown keys.
// ---------------------------------------------------------------------------

export const READINESS_GATE_INFO: Record<string, TermInfo> = {
  data_availability: {
    label: "Data availability",
    explain: "Journals expect a statement on where the data can be found, or why it can't be shared.",
  },
  conflict_of_interest: {
    label: "Conflict of interest",
    explain: "A competing-interests declaration, even if it's 'none'.",
  },
  funding: {
    label: "Funding statement",
    explain: "Who funded the work — or an explicit 'no external funding'.",
  },
  ethics: {
    label: "Ethics approval",
    explain: "IRB / ethics-committee approval with institution and reference number.",
  },
  limitations: {
    label: "Limitations section",
    explain: "An explicit discussion of the study's design and generalizability limits.",
  },
  abstract_structure: {
    label: "Structured abstract",
    explain: "Background / Methods / Results / Conclusions subheadings, as most clinical journals require.",
  },
  primary_outcome_mismatch: {
    label: "Primary outcome differs from protocol",
    explain: "The manuscript's primary outcome doesn't match what the study design specified.",
  },
  outcome_timing_ambiguity: {
    label: "Outcome timing unclear",
    explain: "When the outcome was measured is ambiguous or differs from the planned window.",
  },
  comparator_mismatch: {
    label: "Comparator differs from protocol",
    explain: "The comparison group in the manuscript doesn't match the designed comparator.",
  },
  exclusion_drift: {
    label: "Eligibility criteria drifted",
    explain: "Inclusion/exclusion criteria in the manuscript differ from the design.",
  },
  data_dictionary_inconsistency: {
    label: "Variables inconsistent with data dictionary",
    explain: "Variables in the manuscript don't line up with the study's data dictionary.",
  },
  reporting_checklist_gap: {
    label: "Reporting checklist gap",
    explain: "A committed reporting-guideline item isn't addressed in the manuscript.",
  },
};

/** Humanize any gate key, including agent-invented ones. */
export function gateInfo(gate: string): TermInfo {
  return (
    READINESS_GATE_INFO[gate] ?? {
      label: gate.replace(/_/g, " "),
      explain: "A submission-readiness check identified by the assistant.",
    }
  );
}

// ---------------------------------------------------------------------------
// Confidentiality modes (ProtocolConfidentialityMode)
// ---------------------------------------------------------------------------

export const CONFIDENTIALITY_INFO: Record<string, TermInfo> = {
  local_only: {
    label: "private — stays on this computer",
    explain: "The AI assistant runs on a local model (Ollama, LM Studio, llama-server). Nothing is sent to a cloud service.",
  },
  cloud_default: {
    label: "standard privacy",
    explain: "The AI assistant may use cloud providers (OpenAI, Gemini, DeepSeek), so study text leaves this computer.",
  },
};

// ---------------------------------------------------------------------------
// Evidence kinds (EvidenceItemKind) — singular labels; plural group headers
// stay in styles.ts EVIDENCE_KIND_LABEL.
// ---------------------------------------------------------------------------

export const EVIDENCE_KIND_INFO: Record<string, TermInfo> = {
  prior_design: {
    label: "prior designs",
    explain: "How earlier studies set up the same question — designs you can follow or improve on.",
  },
  population: {
    label: "populations",
    explain: "Who prior studies enrolled — useful for your eligibility criteria.",
  },
  outcome: {
    label: "outcomes",
    explain: "What prior studies measured, and when.",
  },
  confounder: {
    label: "confounders",
    explain: "Variables that could distort the effect you're estimating.",
  },
  bias: {
    label: "known biases",
    explain: "Bias risks reported in prior work on this question.",
  },
  measure: {
    label: "measures",
    explain: "Instruments, scales, and definitions used to capture variables.",
  },
  other: {
    label: "other",
    explain: "Design-relevant items that don't fit another category.",
  },
};

// ---------------------------------------------------------------------------
// Evidence snapshot sources
// ---------------------------------------------------------------------------

export const EVIDENCE_SOURCE_INFO: Record<string, TermInfo> = {
  mdr: {
    label: "Deep-research report (MDR)",
    explain: "A structured export from a multi-step deep-research run over the literature.",
  },
  rw: {
    label: "Research wiki (RW)",
    explain: "An export from a research wiki or knowledge graph of prior work.",
  },
};

// ---------------------------------------------------------------------------
// Artifact kinds (StudyArtifactKind)
// ---------------------------------------------------------------------------

export const ARTIFACT_KIND_INFO: Record<string, TermInfo> = {
  protocol: {
    label: "Protocol",
    explain: "The full study protocol, compiled from your decision cards.",
  },
  sap: {
    label: "Statistical analysis plan (SAP)",
    explain: "Pre-specifies how the data will be analyzed before anyone looks at results.",
  },
  data_dictionary: {
    label: "Data dictionary",
    explain: "Every variable you'll collect: name, definition, type, and allowed values.",
  },
  checklist_map: {
    label: "Reporting checklist",
    explain: "Your design mapped onto the relevant reporting guideline (PRISMA, STROBE, CONSORT…).",
  },
  prospero_fields: {
    label: "PROSPERO registration fields",
    explain: "Pre-filled fields for registering a systematic review on PROSPERO.",
  },
};

// ---------------------------------------------------------------------------
// Reporting guidelines (ReportingGuideline)
// ---------------------------------------------------------------------------

export const GUIDELINE_INFO: Record<string, TermInfo> = {
  PRISMA: { label: "PRISMA", explain: "Reporting guideline for systematic reviews and meta-analyses." },
  "PRISMA-P": { label: "PRISMA-P", explain: "Reporting guideline for systematic-review protocols." },
  STROBE: { label: "STROBE", explain: "Reporting guideline for observational studies (cohort, case-control, cross-sectional)." },
  RECORD: { label: "RECORD", explain: "Extension of STROBE for studies using routinely collected health data." },
  CONSORT: { label: "CONSORT", explain: "Reporting guideline for randomized controlled trials." },
  SPIRIT: { label: "SPIRIT", explain: "Reporting guideline for clinical-trial protocols." },
  "SPIRIT-AI": { label: "SPIRIT-AI", explain: "SPIRIT extension for trial protocols of AI interventions." },
  "CONSORT-AI": { label: "CONSORT-AI", explain: "CONSORT extension for trials of AI interventions." },
  STARD: { label: "STARD", explain: "Reporting guideline for diagnostic-accuracy studies." },
  TRIPOD: { label: "TRIPOD", explain: "Reporting guideline for prediction-model studies." },
  CARE: { label: "CARE", explain: "Reporting guideline for case reports." },
  SRQR: { label: "SRQR", explain: "Reporting standards for qualitative research." },
  COREQ: { label: "COREQ", explain: "Reporting checklist for qualitative interviews and focus groups." },
  ARRIVE: { label: "ARRIVE", explain: "Reporting guideline for animal research." },
};

// ---------------------------------------------------------------------------
// Study modes (StudyMode) — consolidates the divergent MODE_LABEL copies that
// lived in methods/page.tsx and StudyWorkspace.tsx.
// ---------------------------------------------------------------------------

export const STUDY_MODE_INFO: Record<string, TermInfo> = {
  systematic_review: {
    label: "Systematic review",
    explain: "Synthesizing existing studies on a question, with or without meta-analysis.",
  },
  scoping_review: {
    label: "Scoping review",
    explain: "Mapping the breadth of evidence on a topic (PCC framing) → PRISMA-ScR.",
  },
  retrospective_observational: {
    label: "Retrospective observational",
    explain: "Analyzing patient-level data that already exists (registries, EHR, cohorts).",
  },
  interventional: {
    label: "AI-intervention trial",
    explain: "A prospective trial of an AI intervention (SPIRIT-AI / CONSORT-AI).",
  },
};

// ---------------------------------------------------------------------------
// Providers — shared by health UI, settings, setup panel.
// ---------------------------------------------------------------------------

export interface ProviderInfo extends TermInfo {
  kind: "cloud" | "local";
}

export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    kind: "cloud",
    explain: "Cloud provider — easiest to set up, needs an API key; text leaves this computer.",
  },
  gemini: {
    label: "Google Gemini",
    kind: "cloud",
    explain: "Cloud provider — needs a Google AI API key; text leaves this computer.",
  },
  deepseek: {
    label: "DeepSeek",
    kind: "cloud",
    explain: "Cloud provider — needs a DeepSeek API key; text leaves this computer.",
  },
  ollama: {
    label: "Ollama",
    kind: "local",
    explain: "Runs models on this computer — private and free, needs the Ollama app installed.",
  },
  lmstudio: {
    label: "LM Studio",
    kind: "local",
    explain: "Runs models on this computer via the LM Studio app's local server.",
  },
  llama_server: {
    label: "llama-server",
    kind: "local",
    explain: "Runs models on this computer via llama.cpp's built-in server.",
  },
};

// ---------------------------------------------------------------------------
// Misc shared copy
// ---------------------------------------------------------------------------

export const READY_PCT_EXPLAIN =
  "Share of design decisions that are drafted, evidence-backed, assumed, or locked.";

export const ARTIFACT_READY_PCT_EXPLAIN =
  "Share of this document's sections that your decisions have filled in so far.";

export const AUTO_DETECTED_EXPLAIN =
  "Found by an automatic text scan of the manuscript, not by the AI assistant.";

export const STALE_CARD_EXPLAIN =
  "An upstream decision changed since this one was set — re-confirm it still holds.";
