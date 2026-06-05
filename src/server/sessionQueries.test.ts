import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { closeDb, getDb } from "./db";
import { getActiveSession } from "./sessionQueries";

test("getActiveSession skips crashed sessions", () => {
  const previous = process.env.REVIEWER_DATA_DIR;
  const dataDir = mkdtempSync(path.join(tmpdir(), "reviewer-agent-sessions-"));
  process.env.REVIEWER_DATA_DIR = dataDir;
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO manuscripts (id, title, content_md, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("ms-active", "Title", "Body", "draft", 1, 1);
    db.prepare(
      `INSERT INTO sessions
       (id, manuscript_id, workflow, provider, model, effort, provider_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("crashed", "ms-active", "revision", "openai", null, null, null, "crashed", 2, 100);
    db.prepare(
      `INSERT INTO sessions
       (id, manuscript_id, workflow, provider, model, effort, provider_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("idle", "ms-active", "revision", "openai", null, null, null, "idle", 1, 50);

    assert.equal(getActiveSession("ms-active", "revision")?.id, "idle");
  } finally {
    closeDb();
    if (previous === undefined) delete process.env.REVIEWER_DATA_DIR;
    else process.env.REVIEWER_DATA_DIR = previous;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
