import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import type { RevisionTable } from "./types";

export function listRevisionTables(manuscriptId: string): RevisionTable[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM revision_tables WHERE manuscript_id = ? ORDER BY created_at DESC",
    )
    .all(manuscriptId) as RevisionTable[];
}

export function recordRevisionTable(data: {
  manuscript_id: string;
  session_id?: string | null;
  round?: number;
  relative_path: string;
}): RevisionTable {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();
  const round = data.round ?? 1;
  const row: RevisionTable = {
    id,
    manuscript_id: data.manuscript_id,
    session_id: data.session_id ?? null,
    round,
    relative_path: data.relative_path,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO revision_tables (id, manuscript_id, session_id, round, relative_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.manuscript_id, row.session_id, row.round, row.relative_path, row.created_at);
  return row;
}
