/**
 * Seed the experiment corpus: the diabetes anchor + 3 authored seeded-defect
 * manuscripts across guideline families (STROBE / STARD / PRISMA), each with a
 * documented planted-defect ledger and (for two) a reviewer letter.
 *
 *   REVIEWER_DATA_DIR=<expdb> npm run exp:seed-corpus
 *
 * Writes the ledgers to experiments/manuscript-review/ledgers.json keyed by the
 * created manuscript id. The planted defects are MY ground truth for these
 * manuscripts (high quality), augmenting the deterministic gate/checklist key.
 */
import fs from "node:fs";
import path from "node:path";
import { seedDiabetesDemo } from "@/server/demoSeed";
import { createManuscript } from "@/server/manuscripts";
import { createCommentary } from "@/server/commentaries";

interface Ledger {
  layer: "ledger";
  gold_severity: "minor" | "major" | "critical";
  description: string;
  maps_to: string; // the gate/checklist/quality dimension it corresponds to
}

// ---------------------------------------------------------------------------
// B. Cohort study (STROBE)
// ---------------------------------------------------------------------------
const COHORT_MD = `# Leisure-time physical activity and incident depression in community-dwelling older adults: a prospective cohort study

## Abstract
We followed 512 community-dwelling adults aged 65 and older for a mean of 4.2 years to examine whether leisure-time physical activity predicts incident depression. Higher baseline activity was associated with substantially lower depression risk (hazard ratio 0.72, p < 0.05). Regular physical activity reduces the risk of late-life depression and should be prescribed as first-line prevention.

## Introduction
Depression in older adults is common and disabling. Observational data have linked physical activity to better mood, but prospective evidence in the oldest old is limited. We examined the association between leisure-time physical activity and incident depression in a community cohort.

## Methods
Participants were recruited from two primary-care registries. Eligible participants were aged 65 or older, free of depression at baseline (Geriatric Depression Scale < 5), and able to complete questionnaires. Leisure-time physical activity was self-reported at baseline using a validated questionnaire and categorized into tertiles. Incident depression was defined as a Geriatric Depression Scale score of 5 or higher, or a new clinical diagnosis, at annual follow-up. We fit Cox proportional-hazards models with activity tertile as the exposure.

## Results
Of the participants, 498 were included in the analysis. Over follow-up, 96 participants developed incident depression. Compared with the lowest activity tertile, the highest tertile had a markedly lower hazard of depression (hazard ratio 0.72, p < 0.05). The association persisted across age strata.

## Discussion
In this prospective cohort, older adults who were more physically active were far less likely to become depressed. Because physical activity directly lowers depression risk, clinicians should prescribe structured exercise to prevent late-life depression. Our findings support population-level activity promotion.

## Declarations
The authors report no competing interests.
`;

const COHORT_LEDGER: Ledger[] = [
  { layer: "ledger", gold_severity: "major", description: "No ethics/IRB approval statement for a study of human participants.", maps_to: "gate:ethics" },
  { layer: "ledger", gold_severity: "major", description: "No data-availability statement.", maps_to: "gate:data_availability" },
  { layer: "ledger", gold_severity: "minor", description: "No explicit limitations section.", maps_to: "gate:limitations" },
  { layer: "ledger", gold_severity: "minor", description: "Abstract is unstructured (no Background/Methods/Results/Conclusion headings).", maps_to: "gate:abstract_structure" },
  { layer: "ledger", gold_severity: "minor", description: "No funding statement.", maps_to: "gate:funding" },
  { layer: "ledger", gold_severity: "major", description: "Sample-size inconsistency: abstract states 512 followed but Methods/Results analyze 498, with no account of the 14 lost (no attrition/missing-data handling).", maps_to: "consistency" },
  { layer: "ledger", gold_severity: "major", description: "No sample-size or power justification (STROBE-10).", maps_to: "checklist:STROBE-10" },
  { layer: "ledger", gold_severity: "major", description: "Hazard ratio 0.72 reported with only 'p < 0.05' and no 95% confidence interval (STROBE-16).", maps_to: "checklist:STROBE-16" },
  { layer: "ledger", gold_severity: "major", description: "No confounder adjustment: estimates appear unadjusted (no covariates for age, sex, comorbidity, baseline function) yet causal claims are drawn.", maps_to: "evidence:confounding" },
  { layer: "ledger", gold_severity: "major", description: "Causal overclaim from observational data: 'physical activity directly lowers depression risk', 'should be prescribed' — unwarranted causal/clinical language.", maps_to: "evidence:overclaim" },
  { layer: "ledger", gold_severity: "minor", description: "Reverse causation/confounding by indication not addressed (less active participants may be more frail/already prodromal).", maps_to: "evidence:bias" },
];

// ---------------------------------------------------------------------------
// C. Diagnostic accuracy (STARD)
// ---------------------------------------------------------------------------
const DIAG_MD = `# Diagnostic accuracy of a smartphone-based retinal-photograph AI for diabetic retinopathy screening

## Abstract
A smartphone camera with an embedded deep-learning classifier was evaluated for detecting referable diabetic retinopathy. Against an ophthalmologist reference, the classifier achieved a sensitivity of 0.89 and a specificity of 0.91. Smartphone AI screening is accurate and ready for deployment in primary care.

## Introduction
Diabetic retinopathy is a leading cause of preventable blindness, and screening coverage is low. Smartphone-based artificial-intelligence screening could extend access. We evaluated the diagnostic accuracy of one such system.

## Methods
Consecutive adults with diabetes attending an endocrinology clinic were screened with the smartphone classifier. Images were graded automatically as referable or non-referable. The reference standard was dilated fundus examination by an ophthalmologist; however, ophthalmologist examination was performed only on participants the classifier flagged as referable, and a sample of those it cleared. Sensitivity and specificity were computed against the reference.

## Results
Of 410 participants imaged, the classifier flagged 132 as referable. Sensitivity was 0.89 and specificity was 0.91. The system processed each image in under five seconds.

## Discussion
The smartphone classifier was accurate for referable diabetic retinopathy. Given these results, smartphone AI can replace specialist screening in primary care. Wider rollout should proceed.

## Declarations
The authors declare no conflicts of interest. This work was supported by a departmental grant.
`;

const DIAG_LEDGER: Ledger[] = [
  { layer: "ledger", gold_severity: "major", description: "No ethics/IRB approval statement.", maps_to: "gate:ethics" },
  { layer: "ledger", gold_severity: "major", description: "No data-availability statement.", maps_to: "gate:data_availability" },
  { layer: "ledger", gold_severity: "minor", description: "Abstract is unstructured.", maps_to: "gate:abstract_structure" },
  { layer: "ledger", gold_severity: "minor", description: "No limitations section.", maps_to: "gate:limitations" },
  { layer: "ledger", gold_severity: "major", description: "Partial verification / differential-verification bias: the reference standard was applied only to classifier-positives and a sample of negatives, biasing sensitivity and specificity upward (STARD).", maps_to: "evidence:verification_bias" },
  { layer: "ledger", gold_severity: "major", description: "Sensitivity (0.89) and specificity (0.91) reported without 95% confidence intervals.", maps_to: "evidence:no_CI" },
  { layer: "ledger", gold_severity: "major", description: "No participant flow diagram / 2x2 cross-tabulation of index test vs reference standard (STARD).", maps_to: "checklist:STARD_flow" },
  { layer: "ledger", gold_severity: "minor", description: "Indeterminate/ungradable images not reported (STARD).", maps_to: "checklist:STARD_indeterminate" },
  { layer: "ledger", gold_severity: "major", description: "Conclusion 'can replace specialist screening' overreaches the single-clinic accuracy data (no impact/outcome study).", maps_to: "evidence:overclaim" },
  { layer: "ledger", gold_severity: "minor", description: "Spectrum bias: single-clinic endocrinology sample may not reflect screening population.", maps_to: "evidence:bias" },
];

// ---------------------------------------------------------------------------
// D. Systematic review (PRISMA)
// ---------------------------------------------------------------------------
const SR_MD = `# Effectiveness of digital cognitive behavioural therapy for insomnia: a systematic review

## Abstract
We conducted a systematic review of digital cognitive behavioural therapy for insomnia (dCBT-I). We searched PubMed and included 14 trials. dCBT-I improved insomnia severity across studies. dCBT-I is effective and should replace pharmacotherapy as first-line treatment for chronic insomnia.

## Introduction
Chronic insomnia is highly prevalent. Digital delivery of cognitive behavioural therapy could expand access. We systematically reviewed the effectiveness of dCBT-I in adults.

## Methods
We searched PubMed for randomised trials of digital cognitive behavioural therapy for insomnia in adults. Studies were included if they reported insomnia severity outcomes. Two reviewers screened titles. Eligibility criteria required a randomised design and an adult population. Outcomes were summarised narratively.

## Results
Fourteen trials were included. Most reported reductions in insomnia severity favouring dCBT-I over control. Effect sizes varied across studies.

## Discussion
Digital CBT for insomnia was effective across the included trials. On this basis, dCBT-I should replace pharmacotherapy as first-line treatment. Health systems should adopt dCBT-I broadly.

## Declarations
The authors declare no competing interests.
`;

const SR_LEDGER: Ledger[] = [
  { layer: "ledger", gold_severity: "major", description: "No protocol registration (e.g., PROSPERO) reported (PRISMA).", maps_to: "checklist:PRISMA-P-3/registration" },
  { layer: "ledger", gold_severity: "major", description: "No risk-of-bias assessment of included studies (PRISMA-12).", maps_to: "checklist:PRISMA-12" },
  { layer: "ledger", gold_severity: "major", description: "No PRISMA flow diagram of study selection (PRISMA-17).", maps_to: "checklist:PRISMA-17" },
  { layer: "ledger", gold_severity: "major", description: "Inadequate search: a single database (PubMed) with no dates, no full search strategy, and screening of titles only (PRISMA-7).", maps_to: "checklist:PRISMA-7" },
  { layer: "ledger", gold_severity: "major", description: "No data-availability statement.", maps_to: "gate:data_availability" },
  { layer: "ledger", gold_severity: "minor", description: "No funding statement.", maps_to: "gate:funding" },
  { layer: "ledger", gold_severity: "minor", description: "Abstract is unstructured.", maps_to: "gate:abstract_structure" },
  { layer: "ledger", gold_severity: "minor", description: "No limitations section.", maps_to: "gate:limitations" },
  { layer: "ledger", gold_severity: "minor", description: "Heterogeneity of effect sizes acknowledged but not assessed or explained.", maps_to: "evidence:heterogeneity" },
  { layer: "ledger", gold_severity: "major", description: "Overclaim: 'should replace pharmacotherapy as first-line treatment' is not supported by a narrative review without risk-of-bias or comparative analysis.", maps_to: "evidence:overclaim" },
];

function main() {
  const anchor = seedDiabetesDemo();

  const cohort = createManuscript({
    title: "Leisure-time physical activity and incident depression in older adults",
    content_md: COHORT_MD,
    research_domain: "geriatrics",
    research_type: "cohort",
    journal_type: "clinical",
  });
  createCommentary({
    manuscript_id: cohort.id,
    reviewer_label: "Reviewer 1",
    source: "reviewer_report",
    content_md:
      "The conclusion asserts that physical activity 'directly lowers' depression risk, but this is an observational cohort and the estimates do not appear adjusted for confounders. Please temper the causal language and report adjusted hazard ratios with 95% confidence intervals. The abstract reports 512 participants while the analysis includes 498; please reconcile and describe attrition. An ethics-approval statement is also missing.",
  });

  const diag = createManuscript({
    title: "Diagnostic accuracy of a smartphone retinal-photo AI for diabetic retinopathy",
    content_md: DIAG_MD,
    research_domain: "ophthalmology",
    research_type: "diagnostic_accuracy",
    journal_type: "clinical",
  });

  const sr = createManuscript({
    title: "Effectiveness of digital CBT for insomnia: a systematic review",
    content_md: SR_MD,
    research_domain: "sleep medicine",
    research_type: "systematic_review",
    journal_type: "clinical",
  });
  createCommentary({
    manuscript_id: sr.id,
    reviewer_label: "Editor",
    source: "decision_letter",
    content_md:
      "This review needs substantial methods reporting before it can be considered: there is no registered protocol, no risk-of-bias assessment, no PRISMA flow diagram, and the search covers only PubMed with no dates or full strategy. The conclusion that dCBT-I 'should replace pharmacotherapy' is not warranted by the evidence presented.",
  });

  const ledgers: Record<string, Ledger[]> = {
    [cohort.id]: COHORT_LEDGER,
    [diag.id]: DIAG_LEDGER,
    [sr.id]: SR_LEDGER,
  };

  const outDir = path.resolve("experiments/manuscript-review");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ledgers.json"), JSON.stringify(ledgers, null, 2));

  console.log("Seeded corpus:");
  console.log(`  diabetes anchor : ${anchor.manuscriptId}`);
  console.log(`  cohort/STROBE   : ${cohort.id}`);
  console.log(`  diagnostic/STARD: ${diag.id}`);
  console.log(`  sysreview/PRISMA: ${sr.id}`);
  console.log(`Ledgers → experiments/manuscript-review/ledgers.json`);
}

main();
