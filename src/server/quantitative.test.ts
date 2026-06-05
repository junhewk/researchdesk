import test from "node:test";
import assert from "node:assert/strict";
import { runQuantitativeCheck } from "./quantitative";

test("two-sample t-test from summary stats returns expected direction", () => {
  const result = runQuantitativeCheck({
    kind: "two_sample_ttest_from_stats",
    mean1: 10.2,
    sd1: 2.1,
    n1: 40,
    mean2: 9.8,
    sd2: 2.0,
    n2: 42,
  });

  assert.equal(result.kind, "two_sample_ttest_from_stats");
  assert.equal(result.result.test, "Welch two-sample t-test from summary statistics");
  assert.ok(Number(result.result.t) > 0);
  assert.ok(Number(result.result.p_two_sided) > 0.3);
});

test("Wilson interval is bounded and centered near observed proportion", () => {
  const result = runQuantitativeCheck({
    kind: "proportion_ci",
    events: 18,
    total: 50,
  });

  assert.equal(result.kind, "proportion_ci");
  assert.ok(Number(result.result.ci_low) >= 0);
  assert.ok(Number(result.result.ci_high) <= 1);
  assert.ok(Number(result.result.proportion) > Number(result.result.ci_low));
  assert.ok(Number(result.result.proportion) < Number(result.result.ci_high));
});
