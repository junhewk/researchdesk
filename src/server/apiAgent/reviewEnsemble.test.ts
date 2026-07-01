import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGGREGATOR_SYSTEM,
  ANTI_PERSONA_CLAUSE,
  DEFAULT_ENSEMBLE_FANOUT,
  REVIEW_DEPTH_INSTRUCTION,
  composeReviewSystemPrompt,
} from "./workflows";

test("the product default is a 3-reviewer ensemble", () => {
  assert.equal(DEFAULT_ENSEMBLE_FANOUT, 3);
});

test("the aggregator is neutral (anti-persona) and union-preserving, not inventive", () => {
  assert.ok(AGGREGATOR_SYSTEM.includes(ANTI_PERSONA_CLAUSE), "stays anti-persona");
  assert.match(AGGREGATOR_SYSTEM, /union of all genuinely distinct issues/);
  assert.match(AGGREGATOR_SYSTEM, /never invent an issue that no source raised/);
  assert.match(AGGREGATOR_SYSTEM, /Never drop a real issue/);
});

test("review depth guidance asks for comprehensive findings without padding", () => {
  assert.match(REVIEW_DEPTH_INSTRUCTION, /10-18 distinct/);
  assert.match(REVIEW_DEPTH_INSTRUCTION, /never pad/i);
});

test("every ensemble reviewer is the grounded integrated reviewer (no persona)", () => {
  // The product fans out identical grounded reviewers; each composes exactly the
  // grounded, anti-persona system prompt — same one the context arm uses.
  const reviewer = composeReviewSystemPrompt({ grounding: true, personaClause: null });
  assert.ok(reviewer.includes(ANTI_PERSONA_CLAUSE));
  assert.ok(!reviewer.includes("You are a biostatistician"));
});
