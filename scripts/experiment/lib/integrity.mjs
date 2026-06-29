/**
 * Deterministic statistical- and text-integrity checks used as pre-defined
 * grounding for the review experiment. No LLM, no external lookup — these are
 * fixed rule sets / algorithms applied to the reported numbers and the prose.
 *
 *   - GRIM: is a reported mean arithmetically possible for the stated N + scale?
 *   - statcheck: is a reported (test statistic, df, p) internally consistent?
 *   - tortured-phrase / AI-tell scan: does the prose contain known fabrication
 *     fingerprints (paraphraser "tortured phrases", or LLM boilerplate)?
 */

// ---- numerics: regularized incomplete beta (Numerical Recipes) ----
function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x; const tmp0 = x + 5.5; const tmp = tmp0 - (x + 0.5) * Math.log(tmp0);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) { y += 1; ser += c[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Two-sided p-value for Student's t. */
export function tTwoSidedP(t, df) { const a = Math.abs(t); return betai(df / 2, 0.5, df / (df + a * a)); }
/** Upper-tail p-value for an F statistic. */
export function fUpperP(f, d1, d2) { return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f)); }

// ---- GRIM ----
/** Is the reported `meanStr` impossible for `n` integer items in [lo,hi]?
 * Returns {impossible, decimals, nearest}. */
export function grim(meanStr, n, lo = 1, hi = 5) {
  const decimals = (String(meanStr).split(".")[1] || "").length;
  const f = 10 ** decimals;
  const target = Math.round(parseFloat(meanStr) * f);
  let nearest = null, nd = Infinity;
  for (let T = n * lo; T <= n * hi; T += 1) {
    const m = Math.round((T / n) * f);
    if (m === target) return { impossible: false, decimals };
    if (Math.abs(m - target) < nd) { nd = Math.abs(m - target); nearest = m / f; }
  }
  return { impossible: true, decimals, nearest };
}

/** Parse a reported p (number or "<0.001" / "< .05") to a comparable value + kind. */
function parseReportedP(p) {
  if (typeof p === "number") return { value: p, bound: "eq" };
  const s = String(p).replace(/\s/g, "");
  const m = s.match(/^([<>]?)=?(\.?\d+(?:\.\d+)?)/);
  if (!m) return { value: NaN, bound: "eq" };
  return { value: parseFloat(m[2].startsWith(".") ? "0" + m[2] : m[2]), bound: m[1] === "<" ? "lt" : m[1] === ">" ? "gt" : "eq" };
}

/** statcheck-style consistency: recompute p from the statistic and compare to the
 * reported p. Flags gross disagreement or a significance-decision flip at 0.05. */
export function statcheck({ stat, value, df1, df2, p }) {
  let recomputed;
  if (stat === "t") recomputed = tTwoSidedP(value, df1);
  else if (stat === "F") recomputed = fUpperP(value, df1, df2);
  else throw new Error(`unsupported stat ${stat}`);
  const rep = parseReportedP(p);
  const repSig = rep.bound === "lt" ? rep.value <= 0.05 : rep.value < 0.05;
  const recSig = recomputed < 0.05;
  const ratio = recomputed > 0 && rep.value > 0 ? Math.max(recomputed / rep.value, rep.value / recomputed) : Infinity;
  // For a reported "p < X", inconsistent if recomputed clearly exceeds X.
  const boundViolated = rep.bound === "lt" ? recomputed > rep.value * 3 : false;
  const inconsistent = repSig !== recSig || boundViolated || (rep.bound === "eq" && ratio > 3);
  return { recomputed, reported: rep.value, inconsistent, decisionFlip: repSig !== recSig };
}

// ---- tortured phrases + AI tells ----
export const TORTURED = [
  { tortured: "bolster vector machine", canonical: "support vector machine" },
  { tortured: "bolster vector", canonical: "support vector" },
  { tortured: "profound learning", canonical: "deep learning" },
  { tortured: "profound neural organization", canonical: "deep neural network" },
  { tortured: "counterfeit consciousness", canonical: "artificial intelligence" },
  { tortured: "counterfeit neural organization", canonical: "artificial neural network" },
  { tortured: "arbitrary woodland", canonical: "random forest" },
  { tortured: "irregular woodland", canonical: "random forest" },
  { tortured: "credulous bayes", canonical: "naive Bayes" },
  { tortured: "choice tree", canonical: "decision tree" },
  { tortured: "mean square mistake", canonical: "mean squared error" },
  { tortured: "mean square blunder", canonical: "mean squared error" },
  { tortured: "flag to commotion proportion", canonical: "signal-to-noise ratio" },
  { tortured: "flag clamor proportion", canonical: "signal-to-noise ratio" },
  { tortured: "haze figuring", canonical: "cloud computing" },
  { tortured: "huge information", canonical: "big data" },
  { tortured: "bosom peril", canonical: "breast cancer" },
  { tortured: "bosom growth", canonical: "breast cancer" },
  { tortured: "lung malignancy", canonical: "lung cancer" },
  { tortured: "diabetes mellitus sort", canonical: "type of diabetes mellitus" },
  { tortured: "irregular esteem", canonical: "random value" },
  { tortured: "vitality productivity", canonical: "energy efficiency" },
  { tortured: "rakish speed", canonical: "angular velocity" },
  { tortured: "face acknowledgment", canonical: "face recognition" },
  { tortured: "discourse acknowledgment", canonical: "speech recognition" },
  { tortured: "design acknowledgment", canonical: "pattern recognition" },
  { tortured: "movement acknowledgment", canonical: "motion recognition" },
  { tortured: "gaussian commotion", canonical: "Gaussian noise" },
  { tortured: "convolutional neural organization", canonical: "convolutional neural network" },
  { tortured: "recurrent neural organization", canonical: "recurrent neural network" },
  { tortured: "leaf hub", canonical: "leaf node" },
  { tortured: "preparing information", canonical: "training data" },
  { tortured: "test information", canonical: "test data" },
  { tortured: "ground truth esteem", canonical: "ground-truth value" },
  { tortured: "highlight extraction", canonical: "feature extraction" },
  { tortured: "regulated learning", canonical: "supervised learning" },
  { tortured: "unaided learning", canonical: "unsupervised learning" },
  { tortured: "slope plunge", canonical: "gradient descent" },
  { tortured: "misfortune work", canonical: "loss function" },
  { tortured: "exactness review", canonical: "precision recall" },
];

export const AI_TELLS = [
  "as an ai language model",
  "as a large language model",
  "i cannot access real-time data",
  "as of my last knowledge update",
  "i do not have access to real-time",
  "certainly, here is",
  "certainly! here is",
  "here is a possible introduction",
  "i'm sorry, but i cannot",
  "i am unable to provide",
  "regenerate response",
  "note that i am an ai",
];

const norm = (s) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");

/** Scan prose for tortured phrases and AI tells. Returns flagged hits, deduping
 * a match that is a substring of another match (keep the maximal phrase). */
export function scanText(text) {
  const t = norm(text);
  const hits = TORTURED.filter((e) => t.includes(norm(e.tortured)));
  const tortured = hits.filter(
    (e) => !hits.some((o) => o !== e && norm(o.tortured).includes(norm(e.tortured))),
  );
  const aiTells = AI_TELLS.filter((p) => t.includes(p));
  return { tortured, aiTells };
}
