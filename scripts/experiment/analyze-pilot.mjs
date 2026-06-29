/**
 * Compute pilot metrics + factorial contrasts from the workflow output.
 *
 *   node scripts/experiment/analyze-pilot.mjs <results.json> <manifest.json>
 *
 * Descriptive (pilot scale): per-arm means + persona/context main effects and the
 * H4 ensemble contrast. The full study uses the GLMMs in analyze.R.
 */
import fs from "node:fs";

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith("--"));
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const [resultsPath, manifestPath] = pos;
const LABEL = flag("label", "Claude");
const OUTMD = flag("out", "experiments/manuscript-review/RESULTS.md");
const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// gold_id -> layer, per manuscript
const goldLayer = {};
for (const [mid, m] of Object.entries(manifest.manuscripts)) {
  goldLayer[mid] = {};
  for (const g of m.gold) goldLayer[mid][g.id] = g.layer;
}

const ARMS = ["naive", "persona", "context", "persona_context", "ensemble_naive", "ensemble_context"];
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const fmt = (x, d = 2) => (x == null ? "  — " : x.toFixed(d));

function runMetrics(run) {
  const pg = run.verdict?.per_gold ?? [];
  const pi = run.verdict?.per_item ?? [];
  const layerOf = (gid) => goldLayer[run.mid]?.[gid];
  const recallIn = (pred) => {
    const sub = pg.filter((g) => pred(layerOf(g.gold_id)));
    return sub.length ? sub.filter((g) => g.detected).length / sub.length : null;
  };
  const n = pi.length;
  const valid = pi.filter((i) => i.valid).length;
  const halluc = pi.filter((i) => i.hallucination).length;
  const matched = pi.filter((i) => i.matched_gold_id && i.matched_gold_id !== "none").length;
  const detected = pg.filter((g) => g.detected).length;
  return {
    recall: pg.length ? detected / pg.length : null,
    recall_gate: recallIn((l) => l === "gate"),
    recall_checklist: recallIn((l) => l === "checklist"),
    recall_ledger: recallIn((l) => l === "ledger"),
    precision: n ? valid / n : null,
    halluc: n ? halluc / n : null,
    spec: n ? pi.reduce((s, i) => s + (i.specificity ?? 0), 0) / n : null,
    act: n ? pi.reduce((s, i) => s + (i.actionability ?? 0), 0) / n : null,
    nItems: n,
    redundancy: detected ? matched / detected : null,
  };
}

const perArm = {};
for (const arm of ARMS) perArm[arm] = [];
for (const r of results) if (perArm[r.arm]) perArm[r.arm].push(runMetrics(r));

const METRICS = [
  ["recall", "Recall (all gold)"],
  ["recall_gate", "Recall — gate (primary)"],
  ["recall_checklist", "Recall — checklist"],
  ["recall_ledger", "Recall — ledger (curated)"],
  ["precision", "Precision (valid/items)"],
  ["halluc", "Hallucination rate"],
  ["spec", "Specificity (0-2)"],
  ["act", "Actionability (0-2)"],
  ["nItems", "Comments per run"],
  ["redundancy", "Redundancy (items/gold)"],
];

const armMean = {};
for (const arm of ARMS) {
  armMean[arm] = {};
  for (const [k] of METRICS) armMean[arm][k] = mean(perArm[arm].map((m) => m[k]));
}

const lines = [];
const L = (s = "") => lines.push(s);

L("# Persona-vs-Context Review — Pilot Results");
L("");
L(`Base model: **${LABEL}** (held constant across all arms). Manuscripts: ${Object.keys(manifest.manuscripts).length}. ` +
  `Arm-runs scored: ${results.length}. Reps per cell: ~${Math.round(results.length / Object.keys(manifest.manuscripts).length / ARMS.length)}.`);
L("");
L("Ground truth = deterministic readiness gates + reporting-checklist gaps + a curated planted-defect ledger. " +
  "Comments were blind-judged (arm identity stripped, order hashed).");
L("");

// per-arm table
const head = ["Metric", ...ARMS.map((a) => a.replace("ensemble_", "ens_"))];
L("| " + head.join(" | ") + " |");
L("|" + head.map(() => "---").join("|") + "|");
for (const [k, label] of METRICS) {
  const d = k === "nItems" ? 1 : 2;
  L("| " + [label, ...ARMS.map((a) => fmt(armMean[a][k], d))].join(" | ") + " |");
}
L("");

// factorial contrasts on the 2x2 {naive, persona, context, persona_context}
const g = (arm, k) => armMean[arm][k];
L("## Factorial contrasts (2×2 cells)");
L("");
L("| Metric | Persona main effect | Context main effect | Interaction | H4: persona−ensemble (ctx off / on) |");
L("|---|---|---|---|---|");
for (const [k, label] of METRICS) {
  const d = k === "nItems" ? 1 : 2;
  const personaME = mean([
    g("persona", k) != null && g("naive", k) != null ? g("persona", k) - g("naive", k) : null,
    g("persona_context", k) != null && g("context", k) != null ? g("persona_context", k) - g("context", k) : null,
  ]);
  const contextME = mean([
    g("context", k) != null && g("naive", k) != null ? g("context", k) - g("naive", k) : null,
    g("persona_context", k) != null && g("persona", k) != null ? g("persona_context", k) - g("persona", k) : null,
  ]);
  const inter =
    [g("persona_context", k), g("context", k), g("persona", k), g("naive", k)].every((x) => x != null)
      ? g("persona_context", k) - g("context", k) - (g("persona", k) - g("naive", k))
      : null;
  const h4off = g("persona", k) != null && g("ensemble_naive", k) != null ? g("persona", k) - g("ensemble_naive", k) : null;
  const h4on = g("persona_context", k) != null && g("ensemble_context", k) != null ? g("persona_context", k) - g("ensemble_context", k) : null;
  const sgn = (x) => (x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(d));
  L(`| ${label} | ${sgn(personaME)} | ${sgn(contextME)} | ${sgn(inter)} | ${sgn(h4off)} / ${sgn(h4on)} |`);
}
L("");
L("_Reading: context main effect should be **positive** for recall and **negative** for hallucination (H1); " +
  "persona main effect near zero or adverse (H2); interaction near zero (H3); H4 persona−ensemble near zero ⇒ persona = ensembling, not expertise._");

const report = lines.join("\n");
fs.writeFileSync(OUTMD, report + "\n");
console.log(report);
console.log(`\n→ ${OUTMD}`);
