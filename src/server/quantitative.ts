export type QuantitativeCheckInput =
  | {
      kind: "two_sample_ttest_from_stats";
      mean1: number;
      sd1: number;
      n1: number;
      mean2: number;
      sd2: number;
      n2: number;
      alternative?: "two_sided" | "less" | "greater";
    }
  | {
      kind: "one_sample_ttest_from_stats";
      mean: number;
      sd: number;
      n: number;
      mu?: number;
      alternative?: "two_sided" | "less" | "greater";
    }
  | {
      kind: "proportion_ci";
      events: number;
      total: number;
      confidence?: number;
    }
  | {
      kind: "risk_ratio";
      exposedEvents: number;
      exposedTotal: number;
      controlEvents: number;
      controlTotal: number;
      confidence?: number;
    }
  | {
      kind: "odds_ratio";
      exposedEvents: number;
      exposedNonEvents: number;
      controlEvents: number;
      controlNonEvents: number;
      confidence?: number;
    };

export interface QuantitativeCheckResult {
  kind: QuantitativeCheckInput["kind"];
  result: Record<string, number | string | boolean>;
  notes: string[];
}

const EPS = 3e-14;
const FPMIN = 1e-300;

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertTotal(events: number, total: number, eventName: string, totalName: string): void {
  assertNonNegativeInteger(events, eventName);
  assertPositive(total, totalName);
  if (!Number.isInteger(total)) {
    throw new Error(`${totalName} must be an integer`);
  }
  if (events > total) {
    throw new Error(`${eventName} cannot exceed ${totalName}`);
  }
}

function confidenceLevel(value: number | undefined): number {
  const confidence = value ?? 0.95;
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  return confidence;
}

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let x = 0.9999999999998099;
  const adjusted = z - 1;
  for (let i = 0; i < coefficients.length; i += 1) {
    x += coefficients[i] / (adjusted + i + 1);
  }
  const t = adjusted + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (adjusted + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m += 1) {
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

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCdf(t: number, df: number): number {
  assertPositive(df, "df");
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - ib / 2 : ib / 2;
}

function inverseStudentT(p: number, df: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error("p must be between 0 and 1");
  }
  let lo = -100;
  let hi = 100;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf =
    sign *
    (1 -
      (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-z * z)));
  return 0.5 * (1 + erf);
}

function inverseNormal(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error("p must be between 0 and 1");
  }
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 120; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function pValues(t: number, df: number, alternative = "two_sided"): Record<string, number | string> {
  const cdf = studentTCdf(t, df);
  const twoSided = Math.min(1, 2 * Math.min(cdf, 1 - cdf));
  return {
    alternative,
    p_two_sided: twoSided,
    p_less: cdf,
    p_greater: 1 - cdf,
    selected_p:
      alternative === "less"
        ? cdf
        : alternative === "greater"
          ? 1 - cdf
          : twoSided,
  };
}

function finiteSampleNotes(): string[] {
  return [
    "Computed in TypeScript with deterministic formulas; verify against a statistical package for publication-critical claims.",
    "Summary-statistic t-tests assume independent observations and approximately normal sampling distributions.",
  ];
}

export function runQuantitativeCheck(
  input: QuantitativeCheckInput,
): QuantitativeCheckResult {
  switch (input.kind) {
    case "two_sample_ttest_from_stats": {
      assertPositive(input.sd1, "sd1");
      assertPositive(input.sd2, "sd2");
      assertPositive(input.n1, "n1");
      assertPositive(input.n2, "n2");
      if (input.n1 <= 1 || input.n2 <= 1) {
        throw new Error("n1 and n2 must be greater than 1");
      }
      const v1 = (input.sd1 * input.sd1) / input.n1;
      const v2 = (input.sd2 * input.sd2) / input.n2;
      const se = Math.sqrt(v1 + v2);
      const difference = input.mean1 - input.mean2;
      const t = difference / se;
      const df =
        ((v1 + v2) * (v1 + v2)) /
        ((v1 * v1) / (input.n1 - 1) + (v2 * v2) / (input.n2 - 1));
      const ciCritical = inverseStudentT(0.975, df);
      return {
        kind: input.kind,
        result: {
          test: "Welch two-sample t-test from summary statistics",
          mean_difference: difference,
          standard_error: se,
          t,
          df,
          ci_95_low: difference - ciCritical * se,
          ci_95_high: difference + ciCritical * se,
          ...pValues(t, df, input.alternative),
        },
        notes: finiteSampleNotes(),
      };
    }
    case "one_sample_ttest_from_stats": {
      assertPositive(input.sd, "sd");
      assertPositive(input.n, "n");
      if (input.n <= 1) {
        throw new Error("n must be greater than 1");
      }
      const mu = input.mu ?? 0;
      const se = input.sd / Math.sqrt(input.n);
      const difference = input.mean - mu;
      const t = difference / se;
      const df = input.n - 1;
      const ciCritical = inverseStudentT(0.975, df);
      return {
        kind: input.kind,
        result: {
          test: "One-sample t-test from summary statistics",
          mean_difference: difference,
          standard_error: se,
          t,
          df,
          ci_95_low: difference - ciCritical * se,
          ci_95_high: difference + ciCritical * se,
          ...pValues(t, df, input.alternative),
        },
        notes: finiteSampleNotes(),
      };
    }
    case "proportion_ci": {
      assertTotal(input.events, input.total, "events", "total");
      const confidence = confidenceLevel(input.confidence);
      const z = inverseNormal(0.5 + confidence / 2);
      const p = input.events / input.total;
      const denom = 1 + (z * z) / input.total;
      const center = (p + (z * z) / (2 * input.total)) / denom;
      const halfWidth =
        (z *
          Math.sqrt(
            (p * (1 - p)) / input.total + (z * z) / (4 * input.total * input.total),
          )) /
        denom;
      return {
        kind: input.kind,
        result: {
          method: "Wilson score interval",
          proportion: p,
          confidence,
          ci_low: Math.max(0, center - halfWidth),
          ci_high: Math.min(1, center + halfWidth),
        },
        notes: [
          "Wilson interval is usually more stable than the Wald interval for small samples or rare events.",
        ],
      };
    }
    case "risk_ratio": {
      assertTotal(input.exposedEvents, input.exposedTotal, "exposedEvents", "exposedTotal");
      assertTotal(input.controlEvents, input.controlTotal, "controlEvents", "controlTotal");
      const confidence = confidenceLevel(input.confidence);
      const z = inverseNormal(0.5 + confidence / 2);
      const exposed = input.exposedEvents === 0 ? 0.5 : input.exposedEvents;
      const control = input.controlEvents === 0 ? 0.5 : input.controlEvents;
      const exposedTotal = input.exposedEvents === 0 ? input.exposedTotal + 0.5 : input.exposedTotal;
      const controlTotal = input.controlEvents === 0 ? input.controlTotal + 0.5 : input.controlTotal;
      const riskExposed = exposed / exposedTotal;
      const riskControl = control / controlTotal;
      const rr = riskExposed / riskControl;
      const se = Math.sqrt(
        1 / exposed -
          1 / exposedTotal +
          1 / control -
          1 / controlTotal,
      );
      const log = Math.log(rr);
      return {
        kind: input.kind,
        result: {
          method: "Log risk-ratio interval",
          continuity_correction_used:
            input.exposedEvents === 0 || input.controlEvents === 0,
          risk_exposed: riskExposed,
          risk_control: riskControl,
          risk_ratio: rr,
          confidence,
          ci_low: Math.exp(log - z * se),
          ci_high: Math.exp(log + z * se),
        },
        notes: [
          "A 0.5 continuity correction is used when either event cell is zero.",
        ],
      };
    }
    case "odds_ratio": {
      assertNonNegativeInteger(input.exposedEvents, "exposedEvents");
      assertNonNegativeInteger(input.exposedNonEvents, "exposedNonEvents");
      assertNonNegativeInteger(input.controlEvents, "controlEvents");
      assertNonNegativeInteger(input.controlNonEvents, "controlNonEvents");
      const confidence = confidenceLevel(input.confidence);
      const z = inverseNormal(0.5 + confidence / 2);
      const zeroCell =
        input.exposedEvents === 0 ||
        input.exposedNonEvents === 0 ||
        input.controlEvents === 0 ||
        input.controlNonEvents === 0;
      const a = input.exposedEvents + (zeroCell ? 0.5 : 0);
      const b = input.exposedNonEvents + (zeroCell ? 0.5 : 0);
      const c = input.controlEvents + (zeroCell ? 0.5 : 0);
      const d = input.controlNonEvents + (zeroCell ? 0.5 : 0);
      const or = (a * d) / (b * c);
      const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
      const log = Math.log(or);
      return {
        kind: input.kind,
        result: {
          method: "Log odds-ratio interval",
          continuity_correction_used: zeroCell,
          odds_ratio: or,
          confidence,
          ci_low: Math.exp(log - z * se),
          ci_high: Math.exp(log + z * se),
        },
        notes: [
          "A 0.5 continuity correction is used when any 2x2 cell is zero.",
        ],
      };
    }
  }
}
