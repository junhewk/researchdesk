import { test } from "node:test";
import assert from "node:assert/strict";
import { grim, runGrimChecks, statcheck, tTwoSidedP } from "./integrity";

test("GRIM: a possible mean is not flagged", () => {
  // 2 integer items summing to 7 → mean 3.5 is achievable.
  assert.equal(grim("3.5", 2).impossible, false);
  // 3 items, mean 3.00 (sum 9) achievable.
  assert.equal(grim("3.00", 3).impossible, false);
});

test("GRIM: an impossible mean is flagged with a nearest achievable value", () => {
  // n=2: achievable two-decimal means are k/2 = .00 or .50; 3.47 is impossible.
  const r = grim("3.47", 2);
  assert.equal(r.impossible, true);
  assert.ok(r.nearest === 3.5 || r.nearest === 3.45 || r.nearest === 3.0);
  // n=7, one decimal: 3.7 must be T/7 rounded; 3.7*7=25.9 → nearest 26/7=3.714→3.7
  assert.equal(grim("3.7", 7).impossible, false);
});

test("GRIM: integer means are always possible (never flagged)", () => {
  assert.equal(grim("4", 9).impossible, false);
  assert.equal(grim("4.0", 9).impossible, false);
});

test("runGrimChecks: flags an impossible Likert mean with an N + scale cue", () => {
  const text =
    "Participants rated satisfaction on a 5-point Likert scale (n = 12); the mean score was 3.47.";
  const found = runGrimChecks(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].mean, "3.47");
  assert.equal(found[0].n, 12);
});

test("runGrimChecks: ignores means without an integer-scale cue (continuous data)", () => {
  const text = "Mean BMI was 24.53 (n = 8) across the cohort.";
  assert.equal(runGrimChecks(text).length, 0);
});

test("runGrimChecks: ignores possible means even with a scale cue", () => {
  const text = "On the 7-point scale (n = 4), the mean rating was 3.50.";
  assert.equal(runGrimChecks(text).length, 0);
});

test("statcheck: recomputes a t-test p-value and flags a gross mismatch", () => {
  // t(30)=2.04 → two-sided p ≈ 0.05.
  const p = tTwoSidedP(2.04, 30);
  assert.ok(p > 0.04 && p < 0.06);
  // reported p < .001 while recomputed ≈ .05 → inconsistent.
  const r = statcheck({ stat: "t", value: 2.04, df1: 30, p: "<0.001" });
  assert.equal(r.inconsistent, true);
});
