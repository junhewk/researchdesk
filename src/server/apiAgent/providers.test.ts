import assert from "node:assert/strict";
import test from "node:test";
import {
  localApiProviders,
  providerFieldWasProvided,
  requireLocalApiProvider,
} from "./providers";

test("local_only provider validation accepts every local backend", () => {
  for (const provider of localApiProviders) {
    assert.deepEqual(requireLocalApiProvider(provider, true), {
      provider,
      error: null,
    });
  }
});

test("local_only provider validation does not invent a default", () => {
  const result = requireLocalApiProvider(undefined, false);
  assert.equal(result.provider, null);
  assert.ok(result.error);
  assert.match(result.error, /choose a local provider/);
});

test("local_only provider validation rejects cloud backends", () => {
  const result = requireLocalApiProvider("openai", true);
  assert.equal(result.provider, null);
  assert.ok(result.error);
  assert.match(result.error, /use ollama, lmstudio, llama_server/);
});

test("providerFieldWasProvided only checks for an explicit field", () => {
  assert.equal(providerFieldWasProvided({}), false);
  assert.equal(providerFieldWasProvided({ provider: "ollama" }), true);
});
