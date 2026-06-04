import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "./manuscripts";
import type { ManuscriptVersion, ManuscriptVersionSource } from "./types";

export function listManuscriptVersions(
  manuscriptId: string,
): ManuscriptVersion[] {
  return getDb()
    .prepare(
      `SELECT * FROM manuscript_versions
       WHERE manuscript_id = ?
       ORDER BY version_number ASC`,
    )
    .all(manuscriptId) as ManuscriptVersion[];
}

export function getManuscriptVersion(
  versionId: string,
): ManuscriptVersion | undefined {
  return getDb()
    .prepare("SELECT * FROM manuscript_versions WHERE id = ?")
    .get(versionId) as ManuscriptVersion | undefined;
}

function nextVersionNumber(manuscriptId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) AS max
       FROM manuscript_versions
       WHERE manuscript_id = ?`,
    )
    .get(manuscriptId) as { max: number };
  return (row.max ?? 0) + 1;
}

/**
 * Insert the immutable v1 snapshot at upload time. Idempotent — does
 * nothing if a v1 already exists for the manuscript.
 */
export function insertInitialVersion(opts: {
  manuscriptId: string;
  content_md: string;
  created_at: number;
}): ManuscriptVersion {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM manuscript_versions
       WHERE manuscript_id = ? AND version_number = 1`,
    )
    .get(opts.manuscriptId) as ManuscriptVersion | undefined;
  if (existing) return existing;

  const v: ManuscriptVersion = {
    id: `mv_${nanoid(16)}`,
    manuscript_id: opts.manuscriptId,
    version_number: 1,
    label: "Initial upload",
    content_md: opts.content_md,
    source: "upload",
    session_id: null,
    created_at: opts.created_at,
  };
  db.prepare(
    `INSERT INTO manuscript_versions
       (id, manuscript_id, version_number, label, content_md, source, session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    v.id,
    v.manuscript_id,
    v.version_number,
    v.label,
    v.content_md,
    v.source,
    v.session_id,
    v.created_at,
  );
  return v;
}

/**
 * Append a new revised version. Auto-increments version_number, mirrors
 * the new content into manuscripts.content_md so existing readers stay
 * consistent, and touches updated_at.
 */
export function appendManuscriptVersion(opts: {
  manuscriptId: string;
  content_md: string;
  label?: string | null;
  source?: ManuscriptVersionSource;
  session_id?: string | null;
}): ManuscriptVersion {
  const db = getDb();
  const now = nowUnix();
  const versionNumber = nextVersionNumber(opts.manuscriptId);
  const source: ManuscriptVersionSource = opts.source ?? "agent_revise";
  const label =
    opts.label?.trim() ||
    (source === "user_edit"
      ? `Manual edit · v${versionNumber}`
      : `Version ${versionNumber}`);

  const v: ManuscriptVersion = {
    id: `mv_${nanoid(16)}`,
    manuscript_id: opts.manuscriptId,
    version_number: versionNumber,
    label,
    content_md: opts.content_md,
    source,
    session_id: opts.session_id ?? null,
    created_at: now,
  };

  const insertVersion = db.prepare(
    `INSERT INTO manuscript_versions
       (id, manuscript_id, version_number, label, content_md, source, session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const mirrorContent = db.prepare(
    `UPDATE manuscripts SET content_md = ?, updated_at = ? WHERE id = ?`,
  );

  db.transaction(() => {
    insertVersion.run(
      v.id,
      v.manuscript_id,
      v.version_number,
      v.label,
      v.content_md,
      v.source,
      v.session_id,
      v.created_at,
    );
    mirrorContent.run(v.content_md, now, opts.manuscriptId);
  })();

  touchManuscript(opts.manuscriptId);
  return v;
}
