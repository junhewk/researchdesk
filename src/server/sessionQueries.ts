import { getDb } from "./db";
import { getSupervisor } from "./supervisor";
import type { Provider, Session, SessionMode, Workflow } from "./types";

export function getActiveSession(
  manuscriptId: string,
  workflow: Workflow,
): Session | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions
       WHERE manuscript_id = ? AND workflow = ?
         AND status IN ('new', 'running', 'idle', 'awaiting_user')
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(manuscriptId, workflow) as Session | undefined;
}

/**
 * One continuing thread per manuscript. Returns the most recent live
 * workflow='manuscript' session, or creates a new one. Crashed and completed
 * sessions are skipped — they remain queryable as history but do not block
 * a new thread from opening.
 */
export async function getOrCreateManuscriptSession(
  manuscriptId: string,
  opts: {
    provider: Provider;
    model?: string | null;
    effort?: Session["effort"];
    mode?: SessionMode;
  },
): Promise<Session> {
  const existing = getActiveSession(manuscriptId, "manuscript");
  if (existing) return existing;

  return getSupervisor().createSession({
    manuscriptId,
    workflow: "manuscript",
    provider: opts.provider,
    model: opts.model ?? null,
    effort: opts.effort ?? null,
    mode: opts.mode ?? null,
  });
}

export function listManuscriptSessions(
  manuscriptId: string,
  limit = 30,
): Session[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions
       WHERE manuscript_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(manuscriptId, limit) as Session[];
}
