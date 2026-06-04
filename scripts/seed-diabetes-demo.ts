/**
 * Seeds the "diabetes chatbot" running case used in the EBM Research Workshop
 * deck (RA_CAPTURE_01..08). Builds an AI-intervention trial in the Methods
 * Workbench (cards + MDR/RW evidence + compiled artifacts), a deliberately
 * drifting manuscript in My-Articles, a study-bound readiness check, peer-review
 * findings across all four categories, and a reviewer-response draft.
 *
 * Deterministic and offline — no agent/LLM calls. Idempotent: deletes any prior
 * study/manuscript with the same title before re-creating.
 *
 *   npm run seed:demo
 */
import {
  createStudy,
  deleteStudy,
  listStudies,
  patchDecision,
  appendDecisionLog,
  createSnapshot,
  listDecisions,
  updateArtifact,
} from "@/server/studies";
import { extractFromSnapshot } from "@/server/methods/evidence";
import {
  compileArtifact,
  ALL_ARTIFACT_KINDS,
} from "@/server/methods/artifacts";
import {
  createManuscript,
  deleteManuscript,
  listManuscripts,
} from "@/server/manuscripts";
import { createReview } from "@/server/reviews";
import { createResponse, addResponseItem } from "@/server/reviewerResponses";
import {
  createReadinessCheck,
  runReadinessPreChecks,
  runProtocolCompareChecks,
  updateReadinessCheck,
} from "@/server/readinessChecks";
import type { DecisionState } from "@/server/types";

const STUDY_TITLE = "LLM-assisted counseling for type-2 diabetes (AI trial)";
const MANUSCRIPT_TITLE = "Efficacy of LLM-assisted counseling in type-2 diabetes";

function setCard(
  studyId: string,
  cardType: string,
  state: DecisionState,
  value: string,
  fields: Record<string, string>,
  reason: string,
): void {
  patchDecision(studyId, cardType, {
    value_json: JSON.stringify({ value, fields }),
    state,
  });
  appendDecisionLog({
    study_id: studyId,
    card_type: cardType,
    action: state === "locked" ? "locked" : "set",
    decision_md: value,
    reason_md: reason,
  });
}

function purgePrevious(): void {
  for (const s of listStudies({ limit: 500 })) {
    if (s.title === STUDY_TITLE) deleteStudy(s.id);
  }
  for (const m of listManuscripts({ limit: 500 })) {
    if (m.title === MANUSCRIPT_TITLE) deleteManuscript(m.id);
  }
}

function seedStudy(): string {
  const study = createStudy({
    title: STUDY_TITLE,
    mode: "interventional",
    research_question:
      "In adults with type 2 diabetes, does an LLM-based counseling chatbot improve glycaemic control compared with usual care?",
    confidentiality_mode: "cloud_default",
  });
  const id = study.id;

  setCard(
    id,
    "research_question",
    "locked",
    "LLM counseling chatbot vs usual care for glycaemic control in type 2 diabetes.",
    {
      population: "Adults (≥18y) with type 2 diabetes, HbA1c ≥ 7.5%",
      intervention: "LLM-based counseling chatbot delivered via smartphone",
      comparator: "Usual care",
      outcome: "HbA1c reduction",
    },
    "PICO locked with the team before drafting.",
  );

  setCard(
    id,
    "eligibility",
    "drafted",
    "Adults with established T2DM in primary care; data the model accepts limited to structured glucose logs + free-text messages.",
    {
      inclusion: "Age ≥ 18, T2DM ≥ 6 months, HbA1c 7.5–11%, owns a smartphone",
      exclusion: "Type 1 diabetes, pregnancy, severe cognitive impairment, end-stage renal disease",
      input_eligibility:
        "Model accepts self-reported glucose readings and free-text questions; images are out of scope",
    },
    "Input-level eligibility added per SPIRIT-AI 10.",
  );

  setCard(
    id,
    "ai_intervention",
    "locked",
    "GPT-4-class LLM counseling assistant fine-tuned for diabetes self-management coaching.",
    {
      model_version: "GPT-4-class LLM, frozen build v2024-09 (no in-trial updates)",
      input_data:
        "Self-reported glucose logs + patient free-text; validated against device exports at enrolment",
      output: "Plain-language coaching messages + escalation flags to the care team",
      human_oversight:
        "A diabetes nurse reviews all escalation-flagged outputs daily; expertise: ≥2y diabetes care",
      error_handling:
        "Low-confidence or out-of-scope inputs return a templated 'contact your clinician' message; logged for audit",
      integration:
        "Runs offsite on the study server; integrates with the clinic portal via weekly summaries",
    },
    "AI intervention fully specified to satisfy SPIRIT-AI / CONSORT-AI item 5/11a.",
  );

  setCard(
    id,
    "comparator",
    "drafted",
    "Usual care.",
    {
      definition: "Usual care",
      co_intervention: "Existing clinic visits and standard printed diabetes education continue unchanged",
    },
    "Comparator is usual care, not existing digital education — keep distinct.",
  );

  setCard(
    id,
    "randomization",
    "drafted",
    "Computer-generated 1:1 randomization, stratified by baseline HbA1c.",
    { method: "Computer-generated random sequence, stratified by baseline HbA1c", ratio: "1:1" },
    "",
  );
  setCard(
    id,
    "allocation_concealment",
    "drafted",
    "Central web-based allocation concealed from enrolling staff.",
    { mechanism: "Central web randomization service; allocation revealed only after enrolment" },
    "",
  );
  setCard(
    id,
    "blinding",
    "drafted",
    "Outcome assessors and statisticians blinded; participants unblinded (behavioural intervention).",
    { who_blinded: "Outcome assessors and statisticians blinded; participants necessarily unblinded" },
    "",
  );

  setCard(
    id,
    "primary_outcome",
    "locked",
    "Change in HbA1c from baseline.",
    {
      outcome: "HbA1c reduction",
      timepoint: "12 weeks",
      metric: "Mean between-group difference in HbA1c change (%)",
    },
    "Primary endpoint locked at 12 weeks per protocol.",
  );
  setCard(
    id,
    "secondary_outcomes",
    "drafted",
    "Diabetes self-efficacy, medication adherence, treatment satisfaction.",
    { outcomes: "Diabetes self-efficacy; medication adherence; treatment satisfaction" },
    "",
  );

  setCard(
    id,
    "sample_size",
    "drafted",
    "n = 220 (110/arm) for 0.4% HbA1c difference, SD 1.0, 90% power, 15% attrition.",
    {
      target_n: "220 (110 per arm)",
      assumptions: "0.4% HbA1c difference, SD 1.0, α=0.05, 90% power, 15% attrition",
    },
    "",
  );
  setCard(
    id,
    "analysis_plan",
    "drafted",
    "ITT linear mixed model; pre-specified analysis of AI performance errors.",
    {
      primary_analysis: "Intention-to-treat linear mixed model adjusting for baseline HbA1c",
      error_analysis:
        "Audit of escalation-flag precision/recall and rate of out-of-scope responses",
    },
    "Error analysis added per SPIRIT-AI 22 / CONSORT-AI 19.",
  );
  setCard(
    id,
    "missing_data",
    "drafted",
    "Multiple imputation under MAR; sensitivity to MNAR.",
    { strategy: "Multiple imputation (MAR); MNAR sensitivity analysis" },
    "",
  );

  setCard(
    id,
    "ethics_consent",
    "drafted",
    "IRB approval obtained; written informed e-consent in-app.",
    {
      ethics_basis: "Institutional review board approval (ref pending)",
      consent: "Written informed electronic consent within the app before randomization",
    },
    "",
  );
  setCard(
    id,
    "registration",
    "drafted",
    "Prospective trial registration; AI model + code availability statement.",
    {
      registry: "ClinicalTrials.gov (registration planned before enrolment)",
      code_availability:
        "Model weights are proprietary; an inference wrapper will be released on reasonable request",
    },
    "Code-availability commitment recorded per CONSORT-AI 25.",
  );

  // MDR evidence package (deep-research digest).
  const mdr = createSnapshot({
    study_id: id,
    source: "mdr",
    label: "MDR — LLM/chatbot diabetes counseling evidence",
    raw_json: JSON.stringify({
      digest: {
        prior_designs: [
          { label: "RCT of LLM chatbot vs usual care for glycaemic control", detail: "Wu et al., JMIR 2024" },
          { label: "Pre-post app-based diabetes education study", detail: "moderate risk of bias" },
        ],
        populations: [
          { label: "Adults with type 2 diabetes, HbA1c ≥ 7.5%" },
          { label: "Primary-care managed T2DM" },
        ],
        outcomes: [
          { label: "HbA1c change at 12 weeks", detail: "primary efficacy endpoint" },
          { label: "Medication adherence" },
          { label: "Patient education satisfaction", detail: "distinct from clinical effect" },
        ],
        confounders: [
          { label: "Baseline HbA1c" },
          { label: "Health literacy" },
          { label: "Diabetes duration" },
        ],
        biases: [
          { label: "Differential attrition between arms" },
          { label: "Performance bias (unblinded behavioural intervention)" },
        ],
        measures: [
          { label: "HbA1c (% and mmol/mol)" },
          { label: "Morisky Medication Adherence Scale" },
        ],
      },
    }),
  });
  extractFromSnapshot(mdr);

  // RW knowledge map (concept/gap digest).
  const rw = createSnapshot({
    study_id: id,
    source: "rw",
    label: "RW — concept map & evidence gaps",
    raw_json: JSON.stringify({
      digest: {
        prior_designs: [
          { label: "LLM vs rule-based chatbot evidence gap", detail: "LLM-specific trials are scarce" },
        ],
        confounders: [{ label: "Engagement frequency as a mediator" }],
        biases: [{ label: "Conflation of education satisfaction with clinical benefit" }],
        other: [
          { label: "Gap: most evidence is on rule-based chatbots, not LLMs" },
          { label: "Comparator heterogeneity across studies" },
        ],
      },
    }),
  });
  extractFromSnapshot(rw);

  // Compile + persist artifacts; add a manual override on the protocol so the
  // detail view shows the "Manual additions" section.
  const decisions = listDecisions(id);
  for (const kind of ALL_ARTIFACT_KINDS) {
    const compiled = compileArtifact(study, decisions, kind);
    updateArtifact(id, kind, {
      compiled_json: JSON.stringify(compiled),
      ready_pct: compiled.ready_pct,
    });
    if (kind === "protocol") {
      updateArtifact(id, "protocol", {
        override_md:
          "SPIRIT-AI commitments: frozen model build (no in-trial updates); daily nurse review of escalation flags; pre-specified audit of AI performance errors.",
      });
    }
  }

  return id;
}

function seedManuscript(): string {
  // Deliberately drifts from the protocol: reports HbA1c at 8 weeks (not 12),
  // never names the "usual care" comparator, reports no exclusion criteria,
  // omits the "diabetes self-efficacy" secondary outcome, and says nothing about
  // code availability — each surfaces as a protocol↔manuscript readiness finding.
  const content_md = `# Efficacy of LLM-assisted counseling in type-2 diabetes

## Abstract
**Background:** Digital tools may support diabetes self-management. **Methods:** We
randomized adults with type 2 diabetes to an LLM counseling chatbot or a control
arm and measured glycaemic control. **Results:** HbA1c improved in the chatbot
arm at 8 weeks. **Conclusions:** LLM-assisted counseling is effective for
glycaemic control in type 2 diabetes.

## Introduction
Type 2 diabetes management depends on sustained self-care. Conversational agents
have shown promise for patient education, and large language models (LLMs) now
make richer counseling possible. We evaluated whether an LLM counseling chatbot
improves glycaemic control.

## Methods
Adults with type 2 diabetes and a smartphone were enrolled in primary care and
randomized 1:1. The intervention arm received an LLM counseling chatbot; a
control arm received standard printed diabetes education materials. The primary
outcome was change in HbA1c, assessed at 8 weeks. Secondary outcomes included
medication adherence and treatment satisfaction. Analyses followed an
intention-to-treat principle using a linear mixed model.

The study received institutional review board (IRB) approval and all participants
provided written informed consent.

## Results
Of 220 randomized participants, 198 completed follow-up. Mean HbA1c reduction was
greater in the chatbot arm at 8 weeks. Medication adherence and treatment
satisfaction also favoured the intervention.

## Discussion
LLM-assisted counseling improved glycaemic control and was well received. These
findings show that LLM counseling is effective and should be adopted in routine
diabetes care.

### Limitations
Participants were unblinded, follow-up was short, and the trial was conducted at a
single centre.

## Declarations
**Funding:** Supported by an institutional research grant.
**Competing interests:** The authors declare no competing interests.
**Data availability:** De-identified data are available from the corresponding
author on reasonable request.
`;

  const m = createManuscript({
    title: MANUSCRIPT_TITLE,
    content_md,
    research_domain: "endocrinology",
    research_type: "randomized-trial",
    journal_type: "JMIR Diabetes",
  });
  return m.id;
}

function seedReviews(manuscriptId: string): void {
  createReview({
    manuscript_id: manuscriptId,
    category: "structural",
    severity: "major",
    section_ref: "Abstract / Discussion",
    content_md:
      "Conclusion outruns the evidence: the abstract and discussion state LLM counseling 'is effective', but only a short-term, single-centre, unblinded signal is shown. Soften to a hypothesis-generating claim and separate chatbot-era evidence from the LLM-specific gap.",
  });
  createReview({
    manuscript_id: manuscriptId,
    category: "evidence",
    severity: "major",
    section_ref: "Introduction",
    content_md:
      "The literature bundle does not match the outcome: education-satisfaction studies are cited as if they support an HbA1c effect. Re-separate the evidence by outcome and grade clinical-effect evidence on its own.",
  });
  createReview({
    manuscript_id: manuscriptId,
    category: "rewrite",
    severity: "minor",
    section_ref: "Discussion",
    content_md:
      "Several Discussion sentences assert efficacy in a confident tone without locating the uncertainty. Rephrase to show where the uncertainty sits (short follow-up, unblinded participants).",
  });
  createReview({
    manuscript_id: manuscriptId,
    category: "mechanical",
    severity: "minor",
    section_ref: "Results",
    content_md:
      "HbA1c is reported inconsistently (% in some places, mmol/mol in others). Standardize units and report between-group differences with 95% CIs.",
  });
}

function seedReviewerResponse(manuscriptId: string): string {
  const response = createResponse({ manuscriptId, round: 1 });
  addResponseItem({
    responseId: response.id,
    comment_excerpt:
      "Conclusion outruns the evidence: 'LLM counseling is effective' is too strong for a short-term single-centre signal.",
    response_md:
      "We agree and have softened the claim to a hypothesis-generating finding, and now distinguish chatbot-era evidence from the LLM-specific gap.",
    change_pointer_md: "Abstract (Conclusions) and Discussion ¶3",
  });
  addResponseItem({
    responseId: response.id,
    comment_excerpt:
      "Education-satisfaction studies are cited to support an HbA1c effect.",
    response_md:
      "We have re-separated the cited evidence by outcome and now grade the clinical-effect evidence independently of satisfaction evidence.",
    change_pointer_md: "Introduction ¶2 and references",
  });
  addResponseItem({
    responseId: response.id,
    comment_excerpt: "Primary outcome timepoint differs from the protocol.",
    response_md:
      "The protocol pre-specified HbA1c at 12 weeks; the 8-week report was an interim error. We have corrected the timepoint to 12 weeks throughout.",
    change_pointer_md: "Methods (Outcomes) and Results",
  });
  return response.id;
}

function main(): void {
  purgePrevious();
  const studyId = seedStudy();
  const manuscriptId = seedManuscript();
  seedReviews(manuscriptId);
  const responseId = seedReviewerResponse(manuscriptId);

  const check = createReadinessCheck({ manuscriptId, studyId, sessionId: null });
  runReadinessPreChecks({ checkId: check.id, manuscriptId });
  const compare = runProtocolCompareChecks({ checkId: check.id, manuscriptId, studyId });
  updateReadinessCheck(check.id, {
    status: "completed",
    overall_score: 68,
    summary_md:
      "Manuscript drifts from the protocol on the primary-outcome timepoint, the comparator, and reported exclusions, and omits a committed reporting item. Reconcile before submission.",
  });

  const base = process.env.REVIEWER_API_URL || `http://localhost:${process.env.PORT || 3871}`;
  console.log(`\nSeeded diabetes demo (${compare.detected} protocol-compare findings).`);
  console.log("Screenshot deep links:");
  console.log(`  01 Workbench overview     ${base}/methods/${studyId}`);
  console.log(`  02 Protocol detail        ${base}/methods/${studyId}/artifact/protocol`);
  console.log(`  03 SAP + data dictionary  ${base}/methods/${studyId}/artifact/sap`);
  console.log(`                            ${base}/methods/${studyId}/artifact/data_dictionary`);
  console.log(`  04 Reporting checklist    ${base}/methods/${studyId}/artifact/checklist_map`);
  console.log(`  05 Readiness check        ${base}/methods/readiness/${check.id}`);
  console.log(`  06/07 My Review           ${base}/my-articles/${manuscriptId}/workspace?center=peer`);
  console.log(`  08 Reviewer response      ${base}/methods/reviewer-responses/${responseId}`);
}

main();
