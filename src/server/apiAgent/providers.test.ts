import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { closeDb, getDb } from "../db";
import {
  apiProviderSchema,
  localApiProviders,
  providerFieldWasProvided,
  requireLocalApiProvider,
  resolveProviderConfig,
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

test("codex is a cloud provider backed by ChatGPT auth instead of an API key", () => {
  assert.equal(apiProviderSchema.parse("codex"), "codex");
  const previous = process.env.CODEX_MODEL;
  delete process.env.CODEX_MODEL;
  try {
    const resolved = resolveProviderConfig("codex");
    assert.equal(resolved.kind, "cloud");
    assert.equal(resolved.model, "gpt-5.4-mini");
    assert.equal(resolved.apiKey, null);
    assert.equal(resolved.keyEnvVar, null);
  } finally {
    if (previous === undefined) delete process.env.CODEX_MODEL;
    else process.env.CODEX_MODEL = previous;
  }
});

test("local_only provider validation rejects codex", () => {
  const result = requireLocalApiProvider("codex", true);
  assert.equal(result.provider, null);
  assert.ok(result.error);
  assert.match(result.error, /use ollama, lmstudio, llama_server/);
});

test("providerFieldWasProvided only checks for an explicit field", () => {
  assert.equal(providerFieldWasProvided({}), false);
  assert.equal(providerFieldWasProvided({ provider: "ollama" }), true);
});

test("schema accepts codex in provider settings and sessions", () => {
  const previousResearchDesk = process.env.RESEARCHDESK_DATA_DIR;
  const previousReviewer = process.env.REVIEWER_DATA_DIR;
  const dataDir = mkdtempSync(path.join(tmpdir(), "researchdesk-codex-provider-"));
  const manuscriptId = `ms-${path.basename(dataDir)}`;
  const sessionId = `session-${path.basename(dataDir)}`;
  closeDb();
  process.env.RESEARCHDESK_DATA_DIR = dataDir;
  delete process.env.REVIEWER_DATA_DIR;
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO api_provider_settings
        (provider, model, api_key, base_url, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
        model = excluded.model,
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        updated_at = excluded.updated_at`,
    ).run("codex", "gpt-5.4-mini", null, null, 1);
    db.prepare(
      `INSERT INTO manuscripts (id, title, content_md, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(manuscriptId, "Title", "Body", "draft", 1, 1);
    db.prepare(
      `INSERT INTO sessions
       (id, manuscript_id, workflow, provider, model, effort, provider_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, manuscriptId, "manuscript", "codex", "gpt-5.4-mini", null, null, "idle", 1, 1);

    const setting = db
      .prepare("SELECT provider FROM api_provider_settings WHERE provider = ?")
      .get("codex") as { provider: string } | undefined;
    const session = db
      .prepare("SELECT provider FROM sessions WHERE id = ?")
      .get(sessionId) as { provider: string } | undefined;
    assert.equal(setting?.provider, "codex");
    assert.equal(session?.provider, "codex");
  } finally {
    closeDb();
    if (previousResearchDesk === undefined) delete process.env.RESEARCHDESK_DATA_DIR;
    else process.env.RESEARCHDESK_DATA_DIR = previousResearchDesk;
    if (previousReviewer === undefined) delete process.env.REVIEWER_DATA_DIR;
    else process.env.REVIEWER_DATA_DIR = previousReviewer;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
