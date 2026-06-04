import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "./manuscripts";
import { exportCommentary } from "./markdownExport";
import type { Commentary } from "./types";

export function listCommentaries(manuscriptId: string, round?: number): Commentary[] {
  const db = getDb();
  if (round !== undefined) {
    return db
      .prepare("SELECT * FROM commentaries WHERE manuscript_id = ? AND round = ? ORDER BY created_at")
      .all(manuscriptId, round) as Commentary[];
  }
  return db
    .prepare("SELECT * FROM commentaries WHERE manuscript_id = ? ORDER BY round, created_at")
    .all(manuscriptId) as Commentary[];
}

export function getCommentary(id: string): Commentary | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM commentaries WHERE id = ?").get(id) as Commentary | undefined;
}

export function createCommentary(data: {
  manuscript_id: string;
  content_md: string;
  reviewer_label?: string;
  source?: string;
  round?: number;
}): Commentary {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  const maxRound = getMaxRound(data.manuscript_id);
  const commentaryRound = data.round ?? maxRound;

  const c: Commentary = {
    id,
    manuscript_id: data.manuscript_id,
    reviewer_label: data.reviewer_label ?? null,
    content_md: data.content_md,
    source: data.source ?? "uploaded",
    round: commentaryRound,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO commentaries (id, manuscript_id, reviewer_label, content_md, source, round, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(c.id, c.manuscript_id, c.reviewer_label, c.content_md, c.source, c.round, c.created_at);

  touchManuscript(data.manuscript_id);

  exportCommentary(c);
  return c;
}

function getMaxRound(manuscriptId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT MAX(round) as max_round FROM commentaries WHERE manuscript_id = ?")
    .get(manuscriptId) as { max_round: number | null } | undefined;
  return row?.max_round ?? 1;
}

export function deleteCommentary(id: string): boolean {
  const db = getDb();
  const existing = getCommentary(id);
  const result = db.prepare("DELETE FROM commentaries WHERE id = ?").run(id);
  if (existing && result.changes > 0) touchManuscript(existing.manuscript_id);
  return result.changes > 0;
}

export function updateCommentary(
  id: string,
  patch: {
    content_md?: string;
    reviewer_label?: string | null;
    round?: number;
  },
): Commentary | undefined {
  const existing = getCommentary(id);
  if (!existing) return undefined;
  const next: Commentary = {
    ...existing,
    content_md: patch.content_md ?? existing.content_md,
    reviewer_label:
      patch.reviewer_label !== undefined
        ? (patch.reviewer_label?.trim() || null)
        : existing.reviewer_label,
    round: patch.round ?? existing.round,
  };
  getDb()
    .prepare(
      `UPDATE commentaries
          SET content_md = ?, reviewer_label = ?, round = ?
        WHERE id = ?`,
    )
    .run(next.content_md, next.reviewer_label, next.round, id);
  touchManuscript(existing.manuscript_id);
  exportCommentary(next);
  return next;
}
