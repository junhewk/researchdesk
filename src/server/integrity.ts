/**
 * Deterministic statistical-integrity checks for the review grounding pack.
 *
 * Ported from the persona-vs-context experiment (`scripts/experiment/lib/
 * integrity.mjs`). These are fixed algorithms applied to the reported numbers —
 * no LLM, no external lookup — and they catch the one thing the experiment found
 * the model is structurally *incapable* of: the arithmetic of GRIM.
 *
 *   - GRIM: is a reported mean arithmetically possible for the stated N?
 *   - statcheck: is a reported (test statistic, df, p) internally consistent?
 *     (ported for reuse; the experiment found it redundant for *detection*, so it
 *     is not wired into the live review — only GRIM is.)
 *
 * GRIM only validly applies to means of integer-valued items (Likert sums,
 * counts, whole-number scores). Continuous measurements (weight, BMI, age in
 * years with decimals) are NOT GRIM-testable, so {@link runGrimChecks} is
 * deliberately conservative: it requires an explicit N and an integer-scale cue
 * near the mean, and it returns candidates as *context for the reviewer to
 * adjudicate* rather than auto-emitted findings.
 */

// ---- numerics: regularized incomplete beta (Numerical Recipes) ----
function gammaln(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp0 = x + 5.5;
  const tmp = tmp0 - (x + 0.5) * Math.log(tmp0);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t. */
export function tTwoSidedP(t: number, df: number): number {
  const a = Math.abs(t);
  return betai(df / 2, 0.5, df / (df + a * a));
}

/** Upper-tail p-value for an F statistic. */
export function fUpperP(f: number, d1: number, d2: number): number {
  return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
}

// ---- GRIM ----
export interface GrimResult {
  impossible: boolean;
  decimals: number;
  /** nearest achievable mean (only set when impossible) */
  nearest?: number;
}

/**
 * Scale-free GRIM test: is the reported `meanStr` arithmetically achievable as
 * (sum of `n` integers) / `n`, to the reported number of decimals? A mean of n
 * integers must equal some integer T divided by n; if no integer T rounds to the
 * reported mean, it is impossible. (The experiment's variant bounded T by a
 * Likert range; the bound is unnecessary for the impossibility test itself.)
 */
export function grim(meanStr: string, n: number): GrimResult {
  const decimals = (String(meanStr).split(".")[1] || "").length;
  const mean = parseFloat(meanStr);
  if (!Number.isFinite(mean) || !Number.isFinite(n) || n <= 0) {
    return { impossible: false, decimals };
  }
  const f = 10 ** decimals;
  const target = Math.round(mean * f);
  // The only integer sums that can round to `target` lie within ±1 of mean*n.
  const center = mean * n;
  for (let T = Math.floor(center) - 1; T <= Math.ceil(center) + 1; T += 1) {
    if (Math.round((T / n) * f) === target) {
      return { impossible: false, decimals };
    }
  }
  // nearest achievable
  let nearest = target / f;
  let nd = Infinity;
  for (let T = Math.floor(center) - 1; T <= Math.ceil(center) + 1; T += 1) {
    const m = Math.round((T / n) * f) / f;
    if (Math.abs(m - mean) < nd) {
      nd = Math.abs(m - mean);
      nearest = m;
    }
  }
  return { impossible: true, decimals, nearest };
}

/** Parse a reported p (number or "<0.001" / "< .05") to a comparable value + bound. */
function parseReportedP(p: number | string): { value: number; bound: "eq" | "lt" | "gt" } {
  if (typeof p === "number") return { value: p, bound: "eq" };
  const s = String(p).replace(/\s/g, "");
  const m = s.match(/^([<>]?)=?(\.?\d+(?:\.\d+)?)/);
  if (!m) return { value: NaN, bound: "eq" };
  return {
    value: parseFloat(m[2].startsWith(".") ? "0" + m[2] : m[2]),
    bound: m[1] === "<" ? "lt" : m[1] === ">" ? "gt" : "eq",
  };
}

export interface StatcheckResult {
  recomputed: number;
  reported: number;
  inconsistent: boolean;
  decisionFlip: boolean;
}

/** statcheck-style consistency: recompute p from the statistic and compare to the
 * reported p. Flags gross disagreement or a significance-decision flip at 0.05. */
export function statcheck(opts: {
  stat: "t" | "F";
  value: number;
  df1: number;
  df2?: number;
  p: number | string;
}): StatcheckResult {
  let recomputed: number;
  if (opts.stat === "t") recomputed = tTwoSidedP(opts.value, opts.df1);
  else if (opts.stat === "F") recomputed = fUpperP(opts.value, opts.df1, opts.df2 ?? 1);
  else throw new Error(`unsupported stat ${opts.stat}`);
  const rep = parseReportedP(opts.p);
  const repSig = rep.bound === "lt" ? rep.value <= 0.05 : rep.value < 0.05;
  const recSig = recomputed < 0.05;
  const ratio =
    recomputed > 0 && rep.value > 0
      ? Math.max(recomputed / rep.value, rep.value / recomputed)
      : Infinity;
  const boundViolated = rep.bound === "lt" ? recomputed > rep.value * 3 : false;
  const inconsistent =
    repSig !== recSig || boundViolated || (rep.bound === "eq" && ratio > 3);
  return { recomputed, reported: rep.value, inconsistent, decisionFlip: repSig !== recSig };
}

// ---- GRIM over manuscript prose ----
export interface GrimFinding {
  /** the reported mean, verbatim */
  mean: string;
  n: number;
  nearest?: number;
  /** the surrounding sentence/clause, for the reviewer to judge measure type */
  snippet: string;
}

// Cues that the underlying measure is integer-valued (so GRIM validly applies).
const INTEGER_SCALE_CUE =
  /\b(likert|scale|score|sub-?scale|count|items?|points?|rating|questionnaire|inventory|index)\b/i;

/** Find "mean = X (n = Y)"-style reports where X is GRIM-impossible for Y,
 * restricted to contexts that look like integer-valued measures. Conservative by
 * design — these are candidates the reviewer adjudicates, not auto-findings. */
export function runGrimChecks(text: string): GrimFinding[] {
  const findings: GrimFinding[] = [];
  const seen = new Set<string>();
  // Scan decimal numbers; keep only those that are a reported mean (a mean cue
  // just before) of an integer-valued measure (a scale cue nearby) with an N.
  const numRe = /\d+\.\d+/g;
  let match: RegExpExecArray | null;
  while ((match = numRe.exec(text)) !== null) {
    const meanStr = match[0];
    const start = match.index;
    const before = text.slice(Math.max(0, start - 40), start);
    if (!(/\bmean\b|\baverage\b/i.test(before) || /\bM\b/.test(before))) continue;
    // window around the mention for an N and an integer-scale cue
    const window = text.slice(Math.max(0, start - 130), start + 60);
    if (!INTEGER_SCALE_CUE.test(window)) continue;
    const nMatch = window.match(/\bn\s*[=:]?\s*(\d{1,5})\b/i);
    if (!nMatch) continue;
    const n = parseInt(nMatch[1], 10);
    // GRIM only discriminates when n < 10^decimals; skip large n (no power, no
    // false positives) to keep the pack signal-dense.
    const decimals = meanStr.split(".")[1]?.length ?? 0;
    if (n <= 0 || n >= 10 ** decimals) continue;
    const res = grim(meanStr, n);
    if (!res.impossible) continue;
    const key = `${meanStr}|${n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = text
      .slice(Math.max(0, start - 80), start + 100)
      .replace(/\s+/g, " ")
      .trim();
    findings.push({ mean: meanStr, n, nearest: res.nearest, snippet });
  }
  return findings;
}

// ---- tortured phrases + AI tells (ported for reuse; NOT wired into the live
// review — the experiment found them redundant for detection) ----
export const TORTURED: { tortured: string; canonical: string }[] = [
  { tortured: "bolster vector machine", canonical: "support vector machine" },
  { tortured: "profound learning", canonical: "deep learning" },
  { tortured: "counterfeit consciousness", canonical: "artificial intelligence" },
  { tortured: "arbitrary woodland", canonical: "random forest" },
  { tortured: "irregular woodland", canonical: "random forest" },
  { tortured: "credulous bayes", canonical: "naive Bayes" },
  { tortured: "mean square mistake", canonical: "mean squared error" },
  { tortured: "huge information", canonical: "big data" },
  { tortured: "bosom peril", canonical: "breast cancer" },
  { tortured: "lung malignancy", canonical: "lung cancer" },
  { tortured: "face acknowledgment", canonical: "face recognition" },
  { tortured: "highlight extraction", canonical: "feature extraction" },
  { tortured: "regulated learning", canonical: "supervised learning" },
  { tortured: "slope plunge", canonical: "gradient descent" },
  { tortured: "misfortune work", canonical: "loss function" },
];

export const AI_TELLS: string[] = [
  "as an ai language model",
  "as a large language model",
  "as of my last knowledge update",
  "i cannot access real-time data",
  "certainly, here is",
  "i'm sorry, but i cannot",
  "regenerate response",
  "note that i am an ai",
];

const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");

/** Scan prose for tortured phrases and AI tells. Deduplicates a match that is a
 * substring of another match (keeps the maximal phrase). */
export function scanText(text: string): {
  tortured: { tortured: string; canonical: string }[];
  aiTells: string[];
} {
  const t = norm(text);
  const hits = TORTURED.filter((e) => t.includes(norm(e.tortured)));
  const tortured = hits.filter(
    (e) => !hits.some((o) => o !== e && norm(o.tortured).includes(norm(e.tortured))),
  );
  const aiTells = AI_TELLS.filter((p) => t.includes(p));
  return { tortured, aiTells };
}
