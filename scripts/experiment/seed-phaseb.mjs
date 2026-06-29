/**
 * Phase B — the categorical-gap experiment.
 *
 * Builds a self-contained manifest (same format as run-arms-http.mjs consumes)
 * with manuscripts that contain errors ONLY catchable with external grounding:
 *   - protocol drift (reported ≠ registered protocol)
 *   - fabricated / retracted citations (DOI doesn't exist or is retracted)
 *   - miscomputed statistics (reported value ≠ independent recomputation)
 * The truth lives OUTSIDE the manuscript, so persona/ensemble reviewers — who only
 * see the paper — structurally cannot catch them. The `grounded` arm is handed a
 * "verified grounding pack" (protocol + citation validation + recomputation) and
 * is asked to cross-check.
 *
 *   node scripts/experiment/seed-phaseb.mjs
 *   → experiments/manuscript-review/trials/03-phaseb-grounding/manifest.json
 */
import fs from "node:fs";
import path from "node:path";

const CORE_RULES =
  "Never generate novel research content or unsupported claims. Ground findings in the provided material. Prefer concrete, actionable findings. If evidence is insufficient, say what is missing instead of inventing facts.";
const ANTI_PERSONA = "Review as one integrated expert reviewer. Do not adopt a named reviewer persona.";
const SOLO = "Ground your review only in the manuscript text provided below.";
const GROUNDED =
  "You are ALSO given a VERIFIED GROUNDING PACK below (the registered protocol, citation-validation results, and an independent statistical recomputation). Treat it as ground truth. Cross-check the manuscript against it and flag EVERY discrepancy: protocol deviations, citations that do not exist or are retracted, and reported statistics that disagree with the recomputation. For each, cite the specific manuscript claim and the conflicting grounding fact.";

const PERSONAS = [
  ["statistician", "You are a biostatistician. Review strictly from a statistical lens — design, power, analysis assumptions, multiplicity, effect sizes, CIs, missing data, honest reporting of uncertainty."],
  ["methodologist", "You are a research-methodology specialist. Review strictly from a methods lens — validity, bias, protocol adherence, eligibility/comparator/outcome specification, reporting-guideline conformance."],
  ["domain_expert", "You are a senior domain expert in the manuscript's field. Review strictly from a substantive lens — plausibility, clinical relevance, consistency with established evidence, whether conclusions are warranted."],
  ["writer_editor", "You are a scientific writer/editor. Review strictly from a communication lens — structure, clarity, internal consistency, citation/reporting mechanics, precision of claims."],
];

const sys = (clause, grounded = false) =>
  ["You are a journal-article review assistant.", "", `- ${clause}`, `- ${grounded ? GROUNDED : SOLO}`, `- ${CORE_RULES}`].join("\n");

const ARMS = {
  naive: { grounding: false, merge: false, subCalls: [{ label: "single", system: sys(ANTI_PERSONA) }] },
  persona: { grounding: false, merge: true, subCalls: PERSONAS.map(([k, c]) => ({ label: k, system: sys(c) })) },
  ensemble: { grounding: false, merge: true, subCalls: [1, 2, 3, 4].map((i) => ({ label: `reviewer_${i}`, system: sys(ANTI_PERSONA) })) },
  grounded: { grounding: true, merge: false, subCalls: [{ label: "grounded", system: sys(ANTI_PERSONA, true) }] },
};

const INSTRUCTION =
  "Create review findings for substantive problems in this manuscript. Each finding must include the problem, why it matters, and a concrete suggested action. Return JSON with `items` (each: category one of mechanical|rewrite|structural|evidence; severity one of minor|major|critical; section_ref; content_md) and a short `summary_md`.";

// ---------------------------------------------------------------------------
// Manuscripts: each = {title, body, pack (grounding), gold (external errors)}
// ---------------------------------------------------------------------------
const MS = [];

MS.push({
  id: "pb1-hypertension-app",
  title: "A smartphone mindfulness app for hypertension: a randomized controlled trial",
  body: `# A smartphone mindfulness app for hypertension: a randomized controlled trial

## Abstract
**Background.** Stress contributes to hypertension. We tested a smartphone mindfulness app.
**Methods.** Adults with stage-1 hypertension were randomized 1:1 to the app or a waitlist. The primary outcome was change in systolic blood pressure (SBP) at 8 weeks.
**Results.** At 8 weeks, SBP fell by 9.4 mmHg more in the app group than control (p < 0.001).
**Conclusions.** A mindfulness app substantially lowers blood pressure and should be offered in primary care.

## Methods
Participants (n = 180; 90 per arm) used the app daily for 8 weeks. SBP was measured by automated office device. Adherence was tracked in-app. Mindfulness improves autonomic balance and lowers blood pressure [1], and digital delivery improves reach [2].

## Results
Baseline mean SBP was 134 mmHg (app) and 134 mmHg (control). At 8 weeks, app-group SBP was 124.6 mmHg and control 134.0 mmHg; the between-group difference was 9.4 mmHg (p < 0.001). Group SD was 12 mmHg. Adherence was 71%.

## Discussion
This trial shows a mindfulness app lowers blood pressure and could replace first-line lifestyle counseling. Prior digital trials concur [2].

## References
1. Park J, et al. Mindfulness and autonomic regulation. J Behav Med. 2018. doi:10.1007/s10865-018-9920-0
2. Lee K, et al. Digital mindfulness for cardiovascular risk: a randomized trial. JAMA. 2021. doi:10.1001/jama.2021.55512

## Declarations
Ethics approval: IRB #2020-114. Funding: none. Competing interests: none. Data availability: on request. Limitations: single-center.`,
  pack: `### VERIFIED GROUNDING PACK (external truth — treat as ground truth)
#### Registered protocol (NCT-excerpt)
- Primary outcome: change in systolic blood pressure at **24 weeks** (NOT 8 weeks).
- Comparator: **active control (sham relaxation audio)**, not a waitlist.
- Pre-specified primary analysis: ANCOVA adjusting for baseline SBP.
#### Citation validation (Crossref / OpenAlex / Retraction Watch)
- [1] doi:10.1007/s10865-018-9920-0 → VALID (exists, not retracted).
- [2] doi:10.1001/jama.2021.55512 → **DOES NOT EXIST** (no record in Crossref or OpenAlex).
#### Independent statistical recomputation
- Reported: app−control SBP difference 9.4 mmHg, p < 0.001.
- Recomputed from the reported means (124.6 vs 134.0), SD 12, n=90/arm: difference = **9.4 mmHg**, t ≈ 5.25, **p ≈ 2e-7** → the difference and p-value are internally CONSISTENT. (No statistical mismatch here — do not invent one.)`,
  gold: [
    { id: "ext:protocol_timepoint", severity: "major", description: "Protocol pre-specifies the primary outcome at 24 weeks, but the manuscript reports it at 8 weeks (undisclosed change of primary endpoint)." },
    { id: "ext:protocol_comparator", severity: "major", description: "Protocol comparator is an active sham-audio control; the manuscript used a waitlist, inflating the apparent effect." },
    { id: "ext:fake_citation", severity: "major", description: "Reference [2] (doi:10.1001/jama.2021.55512, 'Lee et al. JAMA 2021') does not exist in any index — a fabricated citation." },
  ],
});

MS.push({
  id: "pb2-diabetes-diet",
  title: "Low-carbohydrate coaching for type 2 diabetes: a randomized trial",
  body: `# Low-carbohydrate coaching for type 2 diabetes: a randomized trial

## Abstract
**Methods.** Adults with type 2 diabetes were randomized to low-carb coaching vs usual care for 6 months. The primary outcome was the proportion achieving HbA1c < 7.0%.
**Results.** More coaching participants reached HbA1c < 7.0% (52% vs 38%; risk ratio 1.37, p = 0.004). Mean weight loss was 4.1 kg.
**Conclusions.** Low-carbohydrate coaching markedly improves glycemic control.

## Methods
n = 240 (120/arm). Coaching was delivered by telehealth. We followed standard low-carb guidance [1]. Outcomes assessed at 6 months.

## Results
At 6 months, 62/120 (52%) of coaching vs 46/120 (38%) of control achieved HbA1c < 7.0% (risk ratio 1.37, p = 0.004). Weight fell 4.1 kg (coaching) vs 0.9 kg (control).

## Discussion
Low-carb coaching should become standard care. This extends prior dietary trials [1,2].

## References
1. Feinman RD, et al. Dietary carbohydrate restriction. Nutrition. 2015. doi:10.1016/j.nut.2014.06.011
2. Hallberg SJ, et al. Continuous remote care for diabetes. Diabetes Ther. 2018. doi:10.1007/s13300-018-0373-9

## Declarations
Ethics approval: IRB #2019-77. Funding: none. Competing interests: none. Data availability: on request. Limitations: open-label.`,
  pack: `### VERIFIED GROUNDING PACK (external truth — treat as ground truth)
#### Registered protocol (excerpt)
- Primary outcome: **mean change in HbA1c (%)** at 6 months. The "proportion reaching HbA1c < 7.0%" was a **pre-specified SECONDARY** outcome. The manuscript reports the secondary as if primary (outcome switching).
- Pre-specified: intention-to-treat with multiple imputation for missing HbA1c.
#### Citation validation (Crossref / OpenAlex / Retraction Watch)
- [1] doi:10.1016/j.nut.2014.06.011 → VALID.
- [2] doi:10.1007/s13300-018-0373-9 → **RETRACTED** (Retraction Watch: retracted 2022 for data concerns).
#### Independent statistical recomputation
- Reported: risk ratio 1.37, p = 0.004 for 52% vs 38% (n=120/arm).
- Recomputed: RR = 0.52/0.38 = 1.37 (consistent), but the two-proportion test gives **p ≈ 0.03**, not 0.004 — the reported p-value overstates significance.`,
  gold: [
    { id: "ext:outcome_switch", severity: "critical", description: "Outcome switching: the registered PRIMARY outcome is mean HbA1c change; the manuscript reports a pre-specified SECONDARY (proportion <7.0%) as the primary." },
    { id: "ext:retracted_citation", severity: "major", description: "Reference [2] (Hallberg 2018, doi:10.1007/s13300-018-0373-9) has been RETRACTED and should not be cited as support." },
    { id: "ext:pvalue_mismatch", severity: "major", description: "Reported p = 0.004 for 52% vs 38% (n=120/arm) does not match recomputation (p ≈ 0.03); the significance is overstated." },
  ],
});

MS.push({
  id: "pb3-pollution-cohort",
  title: "Long-term air pollution and incident dementia: a prospective cohort",
  body: `# Long-term air pollution and incident dementia: a prospective cohort

## Abstract
**Methods.** We followed 8,200 adults aged 60+ for a median 9 years. Exposure was residential PM2.5. The outcome was incident dementia.
**Results.** Each 5 µg/m³ increment in PM2.5 was associated with incident dementia (hazard ratio 1.42, 95% CI 1.28 to 1.57).
**Conclusions.** Air pollution is a strong, independent cause of dementia.

## Methods
PM2.5 was assigned by residential land-use regression. Dementia was ascertained from records. Cox models estimated hazard ratios. Prior cohorts report similar associations [1].

## Results
Over follow-up, 612 incident dementia cases occurred. The hazard ratio per 5 µg/m³ PM2.5 was 1.42 (95% CI 1.28 to 1.57).

## Discussion
PM2.5 directly causes dementia and policy must act. This confirms earlier work [1,2].

## References
1. Weuve J, et al. Exposure to particulate air pollution and cognition. Arch Intern Med. 2012. doi:10.1001/archinternmed.2011.683
2. Carey IM, et al. Air pollution and dementia. BMJ Open. 2018. doi:10.1136/bmjopen-2018-022404

## Declarations
Ethics approval: IRB #2017-9. Funding: none. Competing interests: none. Data availability: on request. Limitations: observational.`,
  pack: `### VERIFIED GROUNDING PACK (external truth — treat as ground truth)
#### Registered analysis plan (excerpt)
- Pre-specified PRIMARY model adjusts for age, sex, education, smoking, and **APOE ε4 genotype**.
- The manuscript's reported HR is the **age/sex-only** model; the pre-specified APOE-adjusted HR was 1.11 (95% CI 0.98 to 1.26) — i.e., attenuated to non-significance after the pre-specified adjustment (selective reporting of the unadjusted model).
#### Citation validation (Crossref / OpenAlex / Retraction Watch)
- [1] doi:10.1001/archinternmed.2011.683 → VALID.
- [2] doi:10.1136/bmjopen-2018-022404 → VALID.
#### Independent statistical recomputation
- Reported HR 1.42 (95% CI 1.28–1.57): the CI is internally consistent with the point estimate. (No arithmetic mismatch — do not invent one.) The issue is the UNADJUSTED model being presented instead of the pre-specified adjusted one (see protocol).`,
  gold: [
    { id: "ext:selective_model", severity: "critical", description: "Selective reporting: the pre-specified primary model adjusts for APOE ε4 (giving HR 1.11, CI 0.98–1.26, non-significant); the manuscript reports the unadjusted age/sex-only HR 1.42 as the headline." },
    { id: "ext:causal_overclaim_vs_protocol", severity: "major", description: "The 'directly causes dementia' conclusion is unwarranted given the pre-specified adjusted estimate is null — the causal claim rests on the non-pre-specified model." },
  ],
});

// build manifest
const manuscripts = {};
for (const m of MS) {
  const userContext = `Title: ${m.title}\nResearch type: see text\n\nManuscript:\n${m.body}`;
  manuscripts[m.id] = {
    title: m.title,
    userContext,
    groundingBlock: m.pack,
    gold: m.gold.map((g) => ({ id: g.id, layer: "external", gold_severity: g.severity, description: g.description })),
  };
}

const manifest = {
  schema: "review-manifest/v1",
  meta: { phase: "B", note: "external-only errors (protocol drift, fake/retracted citations, stat miscompute); grounded arm gets a verified grounding pack" },
  instruction: INSTRUCTION,
  arms: ARMS,
  manuscripts,
};

const outDir = "experiments/manuscript-review/trials/03-phaseb-grounding";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
const goldN = Object.values(manuscripts).reduce((s, m) => s + m.gold.length, 0);
console.log(`Phase-B manifest → ${outDir}/manifest.json`);
console.log(`  ${MS.length} manuscripts, ${Object.keys(ARMS).length} arms (naive/persona/ensemble/grounded), ${goldN} external-error gold issues`);
for (const m of MS) console.log(`  ${m.id}: ${m.gold.length} external errors`);
