/**
 * Expand the main-factorial corpus with 6 more seeded-defect manuscripts across
 * guideline families not yet covered (case-control, cross-sectional, diagnostic#2,
 * prediction/TRIPOD, scoping review, RCT#2). Same checklist-grounding format as
 * trials 01/02, so these pool cleanly with trial 02 for inference.
 *
 *   REVIEWER_DATA_DIR=<expdb> npm run exp:seed-expand
 *
 * Seeds into the experiment DB and MERGES the planted-defect ledgers into
 * experiments/manuscript-review/ledgers.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createManuscript } from "@/server/manuscripts";
import { createCommentary } from "@/server/commentaries";

interface Ledger { layer: "ledger"; gold_severity: "minor" | "major" | "critical"; description: string; maps_to: string; }
const L = (gold_severity: Ledger["gold_severity"], description: string, maps_to: string): Ledger => ({ layer: "ledger", gold_severity, description, maps_to });

const DOCS: Array<{ title: string; research_type: string; research_domain: string; body: string; ledger: Ledger[]; letter?: string }> = [
  {
    title: "Coffee consumption and pancreatic cancer risk: a hospital-based case-control study",
    research_type: "case_control",
    research_domain: "oncology",
    body: `# Coffee consumption and pancreatic cancer risk: a hospital-based case-control study

## Abstract
We compared coffee intake between pancreatic cancer cases and hospital controls. Heavy coffee drinkers had higher odds of pancreatic cancer (odds ratio 1.8). Coffee increases pancreatic cancer risk and intake should be reduced.

## Methods
Cases were patients newly diagnosed with pancreatic cancer at one hospital. Controls were other patients admitted to the same hospital. Lifetime coffee consumption was ascertained by interview after diagnosis. Odds ratios were estimated by logistic regression.

## Results
240 cases and 240 controls were enrolled. Heavy coffee drinkers (>3 cups/day) had an odds ratio of 1.8 for pancreatic cancer compared with non-drinkers.

## Discussion
Coffee raises the risk of pancreatic cancer. Public-health messaging should discourage heavy coffee consumption.

## Declarations
Competing interests: none.`,
    ledger: [
      L("major", "No ethics/IRB approval statement.", "gate:ethics"),
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "No funding statement.", "gate:funding"),
      L("minor", "Abstract is unstructured.", "gate:abstract_structure"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("critical", "Recall bias: exposure (coffee) was self-reported by interview AFTER cancer diagnosis, so cases may over-report differently than controls.", "evidence:recall_bias"),
      L("major", "Selection bias: hospital controls may not represent the source population's exposure distribution.", "evidence:selection_bias"),
      L("major", "Odds ratio 1.8 reported with no 95% confidence interval.", "checklist:STROBE-16"),
      L("critical", "No adjustment for smoking — a strong confounder associated with both coffee and pancreatic cancer; estimate is likely confounded.", "evidence:confounding"),
      L("major", "Causal overclaim: 'coffee increases/raises the risk' from an unadjusted case-control study.", "evidence:overclaim"),
    ],
    letter: "Major concerns: exposure was ascertained after diagnosis (recall bias), controls are hospital-based (selection bias), the odds ratio lacks a confidence interval, and there is no adjustment for smoking — the obvious confounder. The causal language is unwarranted.",
  },
  {
    title: "Daily screen time and myopia among schoolchildren: a cross-sectional study",
    research_type: "cross_sectional",
    research_domain: "ophthalmology",
    body: `# Daily screen time and myopia among schoolchildren: a cross-sectional study

## Abstract
We surveyed schoolchildren and measured refraction. Children with more daily screen time were more likely to be myopic (odds ratio 2.1). Screen time causes myopia and should be limited.

## Methods
Children at three schools completed a screen-time questionnaire on a single day; refraction was measured the same day. Myopia was defined as spherical equivalent <= -0.5 D. Associations were estimated with logistic regression.

## Results
Of 600 children surveyed, those in the highest screen-time tertile had an odds ratio of 2.1 for myopia versus the lowest.

## Discussion
Screen time causes myopia in children. Schools should restrict device use to prevent myopia.`,
    ledger: [
      L("major", "No ethics/IRB approval statement.", "gate:ethics"),
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "No funding statement.", "gate:funding"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("critical", "Causal claim ('screen time causes myopia') from a cross-sectional design that cannot establish temporality.", "evidence:overclaim"),
      L("major", "Reverse causation not addressed: myopic children may use screens more (near work), not the reverse.", "evidence:reverse_causation"),
      L("major", "Odds ratio 2.1 reported with no 95% confidence interval.", "checklist:STROBE-16"),
      L("minor", "No sample-size/power justification.", "checklist:STROBE-10"),
    ],
  },
  {
    title: "A serum biomarker panel for early sepsis detection: a diagnostic accuracy study",
    research_type: "diagnostic_accuracy",
    research_domain: "critical care",
    body: `# A serum biomarker panel for early sepsis detection: a diagnostic accuracy study

## Abstract
A three-marker serum panel was evaluated for early sepsis detection in ICU patients. The panel had sensitivity 0.92 and specificity 0.88 against clinical adjudication. The panel is accurate and ready for bedside use.

## Methods
Consecutive ICU patients had the panel measured. The reference standard was clinical adjudication of sepsis by the treating team, who were aware of the panel result. The decision threshold was selected to maximize accuracy in this sample.

## Results
Among 310 ICU patients, sensitivity was 0.92 and specificity was 0.88.

## Discussion
The panel accurately detects early sepsis and can be deployed at the bedside.

## Declarations
Funding: none. Competing interests: none.`,
    ledger: [
      L("major", "No ethics/IRB approval statement.", "gate:ethics"),
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "Abstract is unstructured.", "gate:abstract_structure"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("major", "Sensitivity (0.92) and specificity (0.88) reported without 95% confidence intervals.", "evidence:no_CI"),
      L("major", "No participant flow diagram / 2x2 table of index test vs reference standard (STARD).", "checklist:STARD_flow"),
      L("critical", "Incorporation/review bias: the reference standard (clinical adjudication) was made with knowledge of the panel result, inflating accuracy.", "evidence:review_bias"),
      L("major", "Optimistic threshold: the decision threshold was chosen to maximize accuracy in the same sample (overfitting); no validation set.", "evidence:threshold_overfit"),
      L("minor", "Spectrum bias: ICU-only sample may not generalize to earlier presentation.", "evidence:spectrum_bias"),
      L("major", "Conclusion 'ready for bedside use' overreaches a single-sample accuracy study with no impact data.", "evidence:overclaim"),
    ],
  },
  {
    title: "Development of a 30-day hospital readmission risk score: a prediction model study",
    research_type: "prediction_model",
    research_domain: "health services",
    body: `# Development of a 30-day hospital readmission risk score: a prediction model study

## Abstract
We developed a logistic risk score for 30-day readmission using 22 candidate predictors. The model discriminated well (AUC 0.78). The score is ready for clinical use to target interventions.

## Methods
We used records from one hospital. 22 candidate predictors were entered; there were 60 readmission events. The final model was selected by stepwise selection. Discrimination was assessed by the area under the ROC curve.

## Results
The final model included 12 predictors and achieved an AUC of 0.78 in the development data.

## Discussion
This validated score is ready for clinical use to target readmission-reduction programs.

## Declarations
Ethics: IRB #2020-9. Funding: none. Competing interests: none.`,
    ledger: [
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "Abstract is unstructured.", "gate:abstract_structure"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("critical", "No calibration reported (TRIPOD) — only discrimination (AUC); a score targeting interventions needs calibration.", "checklist:TRIPOD_calibration"),
      L("critical", "Overfitting: 22 candidate predictors with only 60 events (~3 events per variable) plus stepwise selection; AUC 0.78 is optimistic.", "evidence:overfitting"),
      L("major", "No internal validation (bootstrap/cross-validation) or external validation; 'validated' in the abstract is unsupported.", "evidence:no_validation"),
      L("major", "AUC 0.78 reported with no 95% confidence interval.", "evidence:no_CI"),
      L("minor", "Handling of missing predictor data not described.", "evidence:missing_data"),
      L("major", "Conclusion 'ready for clinical use' / 'validated' is unwarranted given no validation and likely optimism.", "evidence:overclaim"),
    ],
  },
  {
    title: "Artificial intelligence in undergraduate medical education: a scoping review",
    research_type: "scoping_review",
    research_domain: "medical education",
    body: `# Artificial intelligence in undergraduate medical education: a scoping review

## Abstract
We reviewed the literature on artificial intelligence in undergraduate medical education. We searched PubMed and included 38 papers. AI is widely beneficial and should be integrated into all medical curricula.

## Methods
We searched PubMed for papers on AI in medical education. Papers were included if they described an AI application in undergraduate medical education. Findings were summarized.

## Results
Thirty-eight papers were included, describing tutoring systems, assessment tools, and chatbots.

## Discussion
AI is broadly beneficial in medical education and should be integrated into all undergraduate curricula immediately.`,
    ledger: [
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "No funding statement.", "gate:funding"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("major", "No registered protocol (e.g., OSF) reported for the scoping review.", "checklist:PRISMA-ScR_registration"),
      L("major", "Inadequate search: a single database (PubMed), no full search strategy, dates, or second reviewer (PRISMA-ScR).", "checklist:PRISMA-ScR_search"),
      L("major", "No PRISMA-ScR flow diagram of source selection.", "checklist:PRISMA-ScR_flow"),
      L("minor", "No data-charting method described (how items were extracted).", "checklist:PRISMA-ScR_charting"),
      L("major", "Overbroad conclusion ('integrate into all curricula immediately') unsupported by a descriptive scoping review.", "evidence:overclaim"),
    ],
    letter: "This scoping review lacks a registered protocol, searched only PubMed without a full strategy, and provides no PRISMA-ScR flow diagram or charting method. The sweeping recommendation to integrate AI into all curricula is not supported by a descriptive mapping of 38 papers.",
  },
  {
    title: "Telehealth-delivered physiotherapy for chronic low back pain: a randomized controlled trial",
    research_type: "rct",
    research_domain: "rehabilitation",
    body: `# Telehealth-delivered physiotherapy for chronic low back pain: a randomized controlled trial

## Abstract
Adults with chronic low back pain were randomized to telehealth physiotherapy or usual care. Pain improved more with telehealth. Telehealth physiotherapy is effective and should be standard care.

## Methods
Participants were randomized to telehealth physiotherapy or usual care for 12 weeks. Pain was assessed. Outcomes were compared between groups.

## Results
Pain improved more in the telehealth group than usual care (mean difference favored telehealth, p = 0.02).

## Discussion
Telehealth physiotherapy is effective for chronic low back pain and should become standard care.

## Declarations
Ethics: IRB #2021-44. Competing interests: none.`,
    ledger: [
      L("major", "No data-availability statement.", "gate:data_availability"),
      L("minor", "No funding statement.", "gate:funding"),
      L("minor", "Abstract is unstructured.", "gate:abstract_structure"),
      L("minor", "No limitations section.", "gate:limitations"),
      L("major", "No trial registration reported (CONSORT).", "checklist:CONSORT_registration"),
      L("major", "No CONSORT participant flow diagram or randomization/allocation/blinding details.", "checklist:CONSORT_flow"),
      L("major", "Primary outcome not defined: no instrument (e.g., NRS/ODI) or timepoint specified.", "evidence:outcome_undefined"),
      L("major", "Effect reported only as 'p = 0.02' with no effect size or 95% confidence interval.", "checklist:CONSORT_effect"),
      L("minor", "No sample-size/power justification.", "checklist:CONSORT_samplesize"),
      L("major", "Conclusion 'should become standard care' overreaches a single unregistered trial.", "evidence:overclaim"),
    ],
  },
];

function main() {
  const ledgerPath = path.resolve("experiments/manuscript-review/ledgers.json");
  const ledgers: Record<string, Ledger[]> = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : {};
  const ids: string[] = [];
  for (const d of DOCS) {
    const m = createManuscript({ title: d.title, content_md: d.body, research_type: d.research_type, research_domain: d.research_domain, journal_type: "clinical" });
    ledgers[m.id] = d.ledger;
    if (d.letter) createCommentary({ manuscript_id: m.id, reviewer_label: "Reviewer 1", source: "reviewer_report", content_md: d.letter });
    ids.push(m.id);
    console.log(`  ${m.id}  ${d.research_type}  ${d.ledger.length} planted defects  ${d.title.slice(0, 40)}`);
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledgers, null, 2));
  fs.writeFileSync(path.resolve("experiments/manuscript-review/expand-ids.json"), JSON.stringify(ids));
  console.log(`\nSeeded ${ids.length} manuscripts; ledgers merged. IDs → expand-ids.json`);
}

main();
