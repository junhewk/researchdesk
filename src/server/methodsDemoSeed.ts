import {
  appendDecisionLog,
  createSnapshot,
  createStudy,
  listDecisions,
  listStudies,
  patchDecision,
  updateArtifact,
} from "@/server/studies";
import { extractFromSnapshot } from "@/server/methods/evidence";
import {
  ALL_ARTIFACT_KINDS,
  compileArtifact,
} from "@/server/methods/artifacts";
import type { DecisionState, Study } from "@/server/types";

const STUDY_TITLE = "Smartphone JITAI for depression (systematic review)";
const RESEARCH_QUESTION =
  "In adults with major depressive disorder, do smartphone-delivered just-in-time adaptive interventions reduce depressive symptoms compared with usual care or static digital tools?";

export interface MethodsWorkbenchDemoSeedResult {
  studyId: string;
  created: boolean;
  links: {
    workbenchOverview: string;
    protocolDetail: string;
    sapDetail: string;
    dataDictionary: string;
    reportingChecklist: string;
    prosperoFields: string;
  };
}

function findExistingStudy(): Study | null {
  return (
    listStudies({ limit: 500 }).find((study) => study.title === STUDY_TITLE) ??
    null
  );
}

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
    stale: false,
  });
  appendDecisionLog({
    study_id: studyId,
    card_type: cardType,
    action: state === "locked" ? "locked" : "set",
    decision_md: value,
    reason_md: reason,
  });
}

function compileArtifacts(study: Study): void {
  const decisions = listDecisions(study.id);
  for (const kind of ALL_ARTIFACT_KINDS) {
    const compiled = compileArtifact(study, decisions, kind);
    updateArtifact(study.id, kind, {
      compiled_json: JSON.stringify(compiled),
      ready_pct: compiled.ready_pct,
    });
  }
}

function seedEvidence(studyId: string): void {
  const mdr = createSnapshot({
    study_id: studyId,
    source: "mdr",
    label: "MDR - smartphone JITAI depression evidence",
    raw_json: JSON.stringify({
      digest: {
        prior_designs: [
          {
            label: "RCTs of smartphone CBT and mood-monitoring apps",
            detail:
              "Most trials compare app access with waitlist, usual care, or psychoeducation; adaptive decision rules are uncommon.",
          },
          {
            label: "Micro-randomized trials of just-in-time support",
            detail:
              "Useful for proximal engagement outcomes, but often underpowered for PHQ-9 change.",
          },
        ],
        populations: [
          { label: "Adults with major depressive disorder or elevated PHQ-9 symptoms" },
          { label: "Outpatient and community samples using personal smartphones" },
        ],
        outcomes: [
          { label: "Depressive symptom severity", detail: "PHQ-9, BDI-II, or HADS-D at 8-12 weeks" },
          { label: "Engagement and adherence", detail: "App sessions, completed prompts, and retention" },
          { label: "Adverse events", detail: "Worsening mood, crisis escalation, and privacy harms" },
        ],
        biases: [
          { label: "High attrition in app-based trials" },
          { label: "Comparator heterogeneity", detail: "Usual care, waitlist, static apps, and psychoeducation are mixed across studies" },
          { label: "Performance bias", detail: "Participants cannot be blinded to app use" },
        ],
        measures: [
          { label: "PHQ-9 total score" },
          { label: "BDI-II score" },
          { label: "App engagement logs" },
        ],
        other: [
          { label: "Safety protocols for suicidal ideation are inconsistently reported" },
        ],
      },
    }),
  });
  extractFromSnapshot(mdr);

  const rw = createSnapshot({
    study_id: studyId,
    source: "rw",
    label: "RW - concept map and evidence gaps",
    raw_json: JSON.stringify({
      digest: {
        prior_designs: [
          {
            label: "Adaptive intervention evidence gap",
            detail:
              "The field often labels interventions as personalized without testing adaptive timing rules.",
          },
        ],
        populations: [
          {
            label: "Comorbid anxiety and antidepressant use",
            detail:
              "Common in trials and likely to explain between-study heterogeneity.",
          },
        ],
        outcomes: [
          {
            label: "Clinically meaningful response",
            detail: "At least 50% symptom reduction or remission threshold.",
          },
        ],
        biases: [
          {
            label: "Digital divide and selection bias",
            detail:
              "Smartphone ownership and comfort with app prompts can shape eligibility and adherence.",
          },
        ],
        other: [
          { label: "Pre-specify whether static mood apps count as eligible comparators" },
          { label: "Separate symptom efficacy from engagement-only endpoints" },
        ],
      },
    }),
  });
  extractFromSnapshot(rw);
}

function seedStudy(): Study {
  const study = createStudy({
    title: STUDY_TITLE,
    mode: "systematic_review",
    research_question: RESEARCH_QUESTION,
    confidentiality_mode: "cloud_default",
  });
  const id = study.id;

  setCard(
    id,
    "review_question",
    "locked",
    "Smartphone-delivered JITAIs versus usual care or static digital tools for depressive symptoms in adults.",
    {
      population:
        "Adults (18 years or older) with diagnosed major depressive disorder or elevated depressive symptoms.",
      intervention:
        "Smartphone-delivered just-in-time adaptive interventions using mood, context, or engagement signals.",
      comparator:
        "Usual care, waitlist, psychoeducation, or static non-adaptive digital mental-health tools.",
      outcome:
        "Change in validated depressive symptom score at 8 to 12 weeks.",
    },
    "PICO locked so eligibility, extraction, and synthesis stay aligned.",
  );

  setCard(
    id,
    "eligibility_criteria",
    "drafted",
    "Include randomized or quasi-randomized evaluations of adult depression-focused smartphone JITAIs.",
    {
      inclusion:
        "Adult samples; smartphone-delivered adaptive timing/content; validated depression outcome; randomized or quasi-randomized comparison.",
      exclusion:
        "Pure SMS reminders, clinician-only decision support, non-depression primary target, no comparator, or engagement-only reports without symptom outcomes.",
      designs:
        "Parallel RCTs, cluster RCTs, and micro-randomized trials with extractable symptom outcomes.",
    },
    "Eligibility distinguishes adaptive intervention logic from static app access.",
  );

  setCard(
    id,
    "information_sources",
    "drafted",
    "Search bibliographic databases, trial registries, and digital-health proceedings from 2012 onward.",
    {
      databases:
        "MEDLINE, Embase, PsycINFO, CENTRAL, IEEE Xplore, ACM Digital Library, ClinicalTrials.gov, WHO ICTRP.",
      date_range:
        "January 2012 to search date; smartphone-era restriction justified by intervention delivery mode.",
    },
    "Sources cover mental health, trials, and human-computer interaction venues.",
  );

  setCard(
    id,
    "search_strategy",
    "drafted",
    "Combine depression terms, smartphone/app terms, and adaptive/JITAI terms; no language limit at search.",
    {
      strategy:
        "(depress* OR mood disorder*) AND (smartphone OR mobile app OR mHealth) AND (just-in-time OR adaptive OR personalized OR ecological momentary).",
      limits:
        "No language limit in search; translate eligible non-English abstracts where feasible; date limit from 2012.",
    },
    "Concept blocks map directly to the locked PICO.",
  );

  setCard(
    id,
    "screening_process",
    "drafted",
    "Two reviewers independently screen titles/abstracts and full texts, with adjudication by a third reviewer.",
    {
      process:
        "Deduplicate in EndNote/Rayyan; pilot 50 records; independent title/abstract and full-text screening.",
      reviewers:
        "Two independent reviewers at each stage; disagreements resolved by consensus or third reviewer.",
    },
    "Independent screening reduces selection errors in a heterogeneous digital-health field.",
  );

  setCard(
    id,
    "data_extraction",
    "drafted",
    "Extract participant criteria, adaptive decision rule, intervention components, comparator, outcomes, follow-up, and safety reporting.",
    {
      items:
        "Population, recruitment source, depression threshold, JITAI trigger signals, decision rule, intervention content, comparator, follow-up, depression scale, engagement, adverse events.",
      process:
        "One reviewer extracts and a second verifies; disagreements logged with source quote and resolution.",
    },
    "Extraction captures the adaptive mechanism, not only the app brand.",
  );

  setCard(
    id,
    "risk_of_bias",
    "drafted",
    "Use RoB 2 for individually randomized and cluster randomized trials; adapt signaling for micro-randomized designs.",
    {
      tool:
        "Cochrane RoB 2; cluster extension where applicable; design-specific notes for micro-randomized trials.",
      process:
        "Two independent assessors; judge attrition, outcome measurement, deviations from intended intervention, and selective reporting.",
    },
    "Attrition and comparator variability are expected high-risk domains.",
  );

  setCard(
    id,
    "effect_measure",
    "locked",
    "Standardized mean difference for depressive symptoms, converted so negative values favor JITAI.",
    {
      measure:
        "Hedges g standardized mean difference for continuous depression scales; risk ratio for remission when reported.",
    },
    "Different validated depression scales require a standardized effect measure.",
  );

  setCard(
    id,
    "synthesis_plan",
    "drafted",
    "Random-effects meta-analysis when at least three sufficiently comparable studies report symptom outcomes; otherwise structured narrative synthesis.",
    {
      approach:
        "Pool symptom outcomes by intervention/comparator family when clinically coherent; otherwise narrative synthesis by adaptive signal and comparator.",
      model:
        "Restricted maximum likelihood random-effects model with Hartung-Knapp adjustment when study count permits.",
    },
    "Comparator heterogeneity makes random-effects and narrative fallback necessary.",
  );

  setCard(
    id,
    "heterogeneity",
    "drafted",
    "Assess clinical heterogeneity before pooling and report tau-squared, I-squared, and prediction intervals where possible.",
    {
      approach:
        "Inspect intervention logic, comparator type, baseline severity, follow-up timing, and attrition; quantify with tau-squared and I-squared.",
    },
    "Heterogeneity is expected from adaptive logic and comparator design.",
  );

  setCard(
    id,
    "subgroup_analyses",
    "drafted",
    "Pre-specify subgroups by adaptive signal type, comparator type, and baseline depression severity.",
    {
      subgroups:
        "Sensor/context-triggered vs self-report-triggered JITAI; usual care/waitlist vs static app comparator; diagnosed MDD vs elevated symptoms.",
    },
    "Subgroups follow the main sources of design variation.",
  );

  setCard(
    id,
    "sensitivity_analyses",
    "drafted",
    "Exclude high-risk-of-bias studies, imputed outcome estimates, and studies with follow-up outside 8 to 12 weeks.",
    {
      analyses:
        "High risk of bias excluded; complete-case only; fixed-effect comparison; symptom scale direction checks; registered-only trial subset.",
    },
    "Sensitivity analyses target attrition and outcome-window instability.",
  );

  setCard(
    id,
    "certainty",
    "drafted",
    "Use GRADE for each primary comparison and outcome, including digital-intervention indirectness.",
    {
      approach:
        "GRADE domains: risk of bias, inconsistency, indirectness, imprecision, publication bias; explain indirectness from comparator and adaptive-signal mismatch.",
    },
    "Certainty statements need to separate symptom efficacy from engagement outcomes.",
  );

  setCard(
    id,
    "registration",
    "drafted",
    "Register with PROSPERO before screening and report according to PRISMA-P / PRISMA 2020.",
    {
      registry:
        "PROSPERO registration planned before title/abstract screening; amendments logged with dates and rationale.",
    },
    "Registration locks the eligibility and synthesis decisions before screening.",
  );

  seedEvidence(id);
  compileArtifacts(study);
  return study;
}

function links(studyId: string): MethodsWorkbenchDemoSeedResult["links"] {
  return {
    workbenchOverview: `/projects/${studyId}/setup`,
    protocolDetail: `/projects/${studyId}/artifact/protocol`,
    sapDetail: `/projects/${studyId}/artifact/sap`,
    dataDictionary: `/projects/${studyId}/artifact/data_dictionary`,
    reportingChecklist: `/projects/${studyId}/artifact/checklist_map`,
    prosperoFields: `/projects/${studyId}/artifact/prospero_fields`,
  };
}

export function seedMethodsWorkbenchDemo(): MethodsWorkbenchDemoSeedResult {
  const existing = findExistingStudy();
  if (existing) {
    compileArtifacts(existing);
    return {
      studyId: existing.id,
      created: false,
      links: links(existing.id),
    };
  }

  const study = seedStudy();
  return {
    studyId: study.id,
    created: true,
    links: links(study.id),
  };
}
