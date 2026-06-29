/**
 * Phase B-2 — test the two new pre-defined grounding items:
 *   (a) statistical-impossibility battery (GRIM + statcheck), and
 *   (b) tortured-phrase / AI-tell text-integrity lexicon.
 *
 * The grounding pack is COMPUTED by the real tools (lib/integrity.mjs) on each
 * manuscript — not hand-written — so this also fixes Phase B's "1.00 by
 * construction" caveat: the tools must actually flag every planted error.
 *
 *   node scripts/experiment/seed-phaseb2.mjs
 *   → experiments/manuscript-review/trials/04-phaseb2-integrity/manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { grim, statcheck, scanText } from "./lib/integrity.mjs";

const CORE_RULES =
  "Never generate novel research content or unsupported claims. Ground findings in the provided material. Prefer concrete, actionable findings. If evidence is insufficient, say what is missing instead of inventing facts.";
const ANTI_PERSONA = "Review as one integrated expert reviewer. Do not adopt a named reviewer persona.";
const SOLO = "Ground your review only in the manuscript text provided below.";
const GROUNDED_B2 =
  "You are ALSO given a VERIFIED INTEGRITY REPORT below: (1) an automated statistical-integrity check — GRIM impossibility tests and statcheck p-value recomputations — and (2) a text-integrity scan listing known 'tortured phrases' (paraphraser fingerprints of plagiarized/paper-mill text) and verbatim AI-generated boilerplate. Treat the report as ground truth. Flag EVERY item it reports as a review finding, citing the specific manuscript location and explaining the problem.";
const PERSONAS = [
  ["statistician", "You are a biostatistician. Review strictly from a statistical lens — design, power, analysis assumptions, multiplicity, effect sizes, CIs, missing data, honest reporting of uncertainty."],
  ["methodologist", "You are a research-methodology specialist. Review strictly from a methods lens — validity, bias, protocol adherence, eligibility/comparator/outcome specification, reporting-guideline conformance."],
  ["domain_expert", "You are a senior domain expert in the manuscript's field. Review strictly from a substantive lens — plausibility, clinical relevance, consistency with established evidence, whether conclusions are warranted."],
  ["writer_editor", "You are a scientific writer/editor. Review strictly from a communication lens — structure, clarity, internal consistency, citation/reporting mechanics, precision of claims."],
];
const sys = (clause, grounded = false) =>
  ["You are a journal-article review assistant.", "", `- ${clause}`, `- ${grounded ? GROUNDED_B2 : SOLO}`, `- ${CORE_RULES}`].join("\n");
const ARMS = {
  naive: { grounding: false, merge: false, subCalls: [{ label: "single", system: sys(ANTI_PERSONA) }] },
  persona: { grounding: false, merge: true, subCalls: PERSONAS.map(([k, c]) => ({ label: k, system: sys(c) })) },
  ensemble: { grounding: false, merge: true, subCalls: [1, 2, 3, 4].map((i) => ({ label: `reviewer_${i}`, system: sys(ANTI_PERSONA) })) },
  grounded: { grounding: true, merge: false, subCalls: [{ label: "grounded", system: sys(ANTI_PERSONA, true) }] },
};
const INSTRUCTION =
  "Create review findings for substantive problems in this manuscript. Each finding must include the problem, why it matters, and a concrete suggested action. Return JSON with `items` (each: category one of mechanical|rewrite|structural|evidence; severity one of minor|major|critical; section_ref; content_md) and a short `summary_md`.";

// Each manuscript: prose body + the structured reported stats the battery runs on
// + which planted errors we expect (the tools must confirm them).
const MS = [
  {
    id: "pb2-mindfulness-rct",
    title: "A workplace mindfulness program for employee anxiety: a randomized trial",
    body: `# A workplace mindfulness program for employee anxiety: a randomized trial

## Abstract
Employees with elevated anxiety were randomized to an 8-week mindfulness program or waitlist. Anxiety (GAD-7, range 0–21) and stress were assessed. The program reduced anxiety and stress.

## Methods
180 employees were randomized. In a pre-specified intensive-monitoring subsample (n = 8 per arm), baseline GAD-7 was recorded daily. Free-text reflections were categorized automatically using a bolster vector machine. Stress change was compared with a t-test.

## Results
In the intensive subsample, mean baseline GAD-7 was 3.47 (n = 8). Across the full sample, the program reduced perceived stress relative to control (t(18) = 1.2, p = 0.004). Anxiety also improved.

## Discussion
A brief workplace mindfulness program meaningfully reduces anxiety and stress and should be adopted by employers.

## Declarations
Ethics: IRB #2021-3. Funding: none. Competing interests: none. Data availability: on request. Limitations: single employer.`,
    stats: [
      { kind: "grim", mean: "3.47", n: 8, lo: 0, hi: 21, where: "Results (intensive subsample mean GAD-7)" },
      { kind: "statcheck", stat: "t", value: 1.2, df1: 18, p: 0.004, where: "Results (stress t-test)" },
    ],
  },
  {
    id: "pb2-dl-diagnostic",
    title: "A deep-learning model for chest-radiograph triage: a diagnostic study",
    body: `# A deep-learning model for chest-radiograph triage: a diagnostic study

## Abstract
We developed a profound learning model to triage chest radiographs and compared it with two baselines.

## Methods
The model was trained on 40,000 radiographs. Eight radiologists rated output usefulness on a 1–5 scale. Performance was compared with two baselines by ANOVA.

## Results
Mean radiologist usefulness rating was 4.18 (8 raters). The model outperformed the two baselines (F(2, 87) = 1.5, p < 0.001).

## Discussion
As an AI language model, I cannot access real-time data, but the clinical implications are substantial: the model is ready for deployment in emergency triage.

## Declarations
Ethics: IRB #2020-51. Funding: none. Competing interests: none. Data availability: on request. Limitations: single-center.`,
    stats: [
      { kind: "grim", mean: "4.18", n: 8, lo: 1, hi: 5, where: "Results (mean usefulness rating)" },
      { kind: "statcheck", stat: "F", value: 1.5, df1: 2, df2: 87, p: "<0.001", where: "Results (ANOVA vs baselines)" },
    ],
  },
  {
    id: "pb2-pollution-cohort",
    title: "Traffic-related air pollution and lung function in adults: a cohort study",
    body: `# Traffic-related air pollution and lung function in adults: a cohort study

## Abstract
We examined whether traffic-related air pollution is associated with reduced lung function in a cohort of adults.

## Methods
Exposure was estimated with arbitrary woodland regression models. In a calibration subsample (n = 8), a technician-rated data-quality score (1–5) was recorded. The association with FEV1 decline was tested.

## Results
The mean data-quality score was 2.83 (n = 8). Higher pollution was associated with faster FEV1 decline (t(40) = 1.5, p < 0.001).

## Discussion
Traffic-related air pollution directly impairs lung function and warrants immediate regulation.

## Declarations
Ethics: IRB #2019-22. Funding: none. Competing interests: none. Data availability: on request. Limitations: observational.`,
    stats: [
      { kind: "grim", mean: "2.83", n: 8, lo: 1, hi: 5, where: "Results (mean data-quality score)" },
      { kind: "statcheck", stat: "t", value: 1.5, df1: 40, p: "<0.001", where: "Results (pollution–FEV1 t-test)" },
    ],
  },
];

function buildPackAndGold(m) {
  const lines = ["### VERIFIED INTEGRITY REPORT (automated; treat as ground truth)", "#### Statistical integrity"];
  const gold = [];
  for (const s of m.stats) {
    if (s.kind === "grim") {
      const r = grim(s.mean, s.n, s.lo, s.hi);
      if (!r.impossible) throw new Error(`${m.id}: GRIM expected impossible for mean ${s.mean} (n=${s.n}) but tool says possible`);
      lines.push(`- GRIM: reported mean ${s.mean} (n=${s.n}, scale ${s.lo}–${s.hi}) is IMPOSSIBLE — no integer total yields it; nearest achievable mean is ${r.nearest}. Likely a typo or fabricated value. [${s.where}]`);
      gold.push({ id: `grim:${s.mean}`, layer: "stat", gold_severity: "major", description: `Reported mean ${s.mean} (n=${s.n}, scale ${s.lo}–${s.hi}) is GRIM-impossible (no integer dataset produces it).` });
    } else {
      const r = statcheck(s);
      if (!r.inconsistent) throw new Error(`${m.id}: statcheck expected inconsistent for ${s.stat}=${s.value} p=${s.p} but tool says consistent (recomputed ${r.recomputed})`);
      lines.push(`- statcheck: reported ${s.stat}(${s.df2 ? `${s.df1},${s.df2}` : s.df1})=${s.value}, p=${s.p} is INCONSISTENT — recomputed p ≈ ${r.recomputed.toFixed(3)}${r.decisionFlip ? " (significance flips)" : ""}. Reported p misstates the result. [${s.where}]`);
      gold.push({ id: `statcheck:${s.stat}${s.value}`, layer: "stat", gold_severity: "major", description: `Reported ${s.stat}=${s.value} (df ${s.df2 ? `${s.df1},${s.df2}` : s.df1}), p=${s.p} does not match recomputation (p ≈ ${r.recomputed.toFixed(3)}).` });
    }
  }
  const scan = scanText(m.body);
  lines.push("#### Text integrity");
  if (scan.tortured.length === 0 && scan.aiTells.length === 0) lines.push("- (no tortured phrases or AI boilerplate detected)");
  for (const tphr of scan.tortured) {
    lines.push(`- Tortured phrase: "${tphr.tortured}" → canonical "${tphr.canonical}" (paraphraser fingerprint; possible plagiarism/paper-mill origin).`);
    gold.push({ id: `tortured:${tphr.tortured}`, layer: "text", gold_severity: "major", description: `"${tphr.tortured}" is a tortured phrase (fingerprint for "${tphr.canonical}"), indicating likely paraphrased/plagiarized or paper-mill text.` });
  }
  for (const tell of scan.aiTells) {
    lines.push(`- AI boilerplate: verbatim "${tell}" left in the text.`);
    gold.push({ id: `aitell:${tell.slice(0, 16)}`, layer: "text", gold_severity: "critical", description: `Verbatim AI-generated boilerplate ("${tell}…") was left in the manuscript.` });
  }
  return { pack: lines.join("\n"), gold };
}

const manuscripts = {};
let total = 0;
for (const m of MS) {
  const { pack, gold } = buildPackAndGold(m);
  manuscripts[m.id] = {
    title: m.title,
    userContext: `Title: ${m.title}\n\nManuscript:\n${m.body}`,
    groundingBlock: pack,
    gold,
  };
  total += gold.length;
  console.log(`  ${m.id}: ${gold.length} planted errors confirmed by tools (${gold.map((g) => g.layer).join(",")})`);
}

const manifest = {
  schema: "review-manifest/v1",
  meta: { phase: "B-2", note: "stat-impossibility battery (GRIM/statcheck) + tortured-phrase/AI-tell lexicon; grounding pack is COMPUTED by lib/integrity.mjs" },
  instruction: INSTRUCTION,
  arms: ARMS,
  manuscripts,
};
const outDir = "experiments/manuscript-review/trials/04-phaseb2-integrity";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nPhase B-2 manifest → ${outDir}/manifest.json`);
console.log(`  ${MS.length} manuscripts, 4 arms, ${total} tool-confirmed planted errors (stat + text integrity)`);
