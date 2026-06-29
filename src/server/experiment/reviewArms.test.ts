import { test } from "node:test";
import assert from "node:assert/strict";
import { composeReviewSystemPrompt } from "@/server/apiAgent/workflows";
import { ARMS, ALL_ARMS, PERSONA_ROSTER, isArmName } from "./reviewArms";

/** Indices of lines that differ between two equal-length prompts. */
function differingLines(a: string, b: string): number[] {
  const la = a.split("\n");
  const lb = b.split("\n");
  assert.equal(la.length, lb.length, "prompts have the same number of lines");
  const diff: number[] = [];
  for (let i = 0; i < la.length; i += 1) if (la[i] !== lb[i]) diff.push(i);
  return diff;
}

test("context factor changes exactly one prompt line (naive vs context)", () => {
  const naive = composeReviewSystemPrompt({ grounding: false, personaClause: null });
  const context = composeReviewSystemPrompt({ grounding: true, personaClause: null });
  assert.equal(differingLines(naive, context).length, 1, "only the grounding clause differs");
});

test("persona factor changes exactly one prompt line (integrated vs persona)", () => {
  const integrated = composeReviewSystemPrompt({ grounding: false, personaClause: null });
  const persona = composeReviewSystemPrompt({
    grounding: false,
    personaClause: PERSONA_ROSTER[0].clause,
  });
  assert.equal(differingLines(integrated, persona).length, 1, "only the persona clause differs");
});

test("persona and ensemble arms share the same call budget (4)", () => {
  assert.equal(ARMS.persona.fanout, PERSONA_ROSTER.length);
  assert.equal(ARMS.ensemble_naive.fanout, PERSONA_ROSTER.length);
  assert.equal(ARMS.persona_context.fanout, PERSONA_ROSTER.length);
  assert.equal(ARMS.ensemble_context.fanout, PERSONA_ROSTER.length);
});

test("the 2x2 factorial cells decode to the right factor flags", () => {
  assert.deepEqual(
    { p: ARMS.naive.persona, g: ARMS.naive.grounding },
    { p: false, g: false },
  );
  assert.deepEqual(
    { p: ARMS.persona.persona, g: ARMS.persona.grounding },
    { p: true, g: false },
  );
  assert.deepEqual(
    { p: ARMS.context.persona, g: ARMS.context.grounding },
    { p: false, g: true },
  );
  assert.deepEqual(
    { p: ARMS.persona_context.persona, g: ARMS.persona_context.grounding },
    { p: true, g: true },
  );
});

test("ensemble controls are non-persona but multi-call (isolate framing from ensembling)", () => {
  assert.equal(ARMS.ensemble_naive.persona, false);
  assert.equal(ARMS.ensemble_naive.ensemble, true);
  assert.equal(ARMS.ensemble_context.persona, false);
  assert.equal(ARMS.ensemble_context.ensemble, true);
});

test("context arm == single grounded integrated reviewer (product parity shape)", () => {
  assert.deepEqual(ARMS.context, { persona: false, ensemble: false, grounding: true, fanout: 1 });
});

test("isArmName guards the arm set", () => {
  assert.equal(ALL_ARMS.length, 6);
  for (const a of ALL_ARMS) assert.ok(isArmName(a));
  assert.equal(isArmName("statistician"), false);
  assert.equal(isArmName(""), false);
});
