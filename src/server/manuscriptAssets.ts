import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "./manuscripts";
import type {
  ManuscriptAsset,
  ManuscriptAssetKind,
  ManuscriptAssetSummary,
} from "./types";

const VALID_KINDS: readonly ManuscriptAssetKind[] = [
  "table",
  "appendix",
  "figure",
  "supplement",
  "response_letter",
  "other",
];

function isValidKind(value: string): value is ManuscriptAssetKind {
  return (VALID_KINDS as readonly string[]).includes(value);
}

export function listAssets(manuscriptId: string): ManuscriptAssetSummary[] {
  return getDb()
    .prepare(
      `SELECT id, manuscript_id, kind, label, original_file, file_format,
              byte_size, version_number, position, created_at, updated_at
         FROM manuscript_assets
        WHERE manuscript_id = ?
        ORDER BY position ASC, created_at ASC`,
    )
    .all(manuscriptId) as ManuscriptAssetSummary[];
}

export function getAsset(
  manuscriptId: string,
  assetId: string,
): ManuscriptAsset | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM manuscript_assets
        WHERE manuscript_id = ? AND id = ?`,
    )
    .get(manuscriptId, assetId) as ManuscriptAsset | undefined;
}

function nextPosition(manuscriptId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max
         FROM manuscript_assets
        WHERE manuscript_id = ?`,
    )
    .get(manuscriptId) as { max: number };
  return (row.max ?? -1) + 1;
}

export function createAsset(opts: {
  manuscriptId: string;
  kind: ManuscriptAssetKind;
  label?: string | null;
  original_file: string;
  file_format?: string | null;
  content_md: string;
  byte_size?: number | null;
  version_number?: number | null;
}): ManuscriptAsset {
  if (!isValidKind(opts.kind)) {
    throw new Error(`invalid asset kind: ${opts.kind}`);
  }
  const db = getDb();
  const now = nowUnix();
  const a: ManuscriptAsset = {
    id: `ma_${nanoid(16)}`,
    manuscript_id: opts.manuscriptId,
    kind: opts.kind,
    label: opts.label?.trim() || null,
    original_file: opts.original_file,
    file_format: opts.file_format ?? null,
    content_md: opts.content_md,
    byte_size: opts.byte_size ?? Buffer.byteLength(opts.content_md, "utf8"),
    version_number: opts.version_number ?? null,
    position: nextPosition(opts.manuscriptId),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO manuscript_assets
       (id, manuscript_id, kind, label, original_file, file_format,
        content_md, byte_size, version_number, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    a.id,
    a.manuscript_id,
    a.kind,
    a.label,
    a.original_file,
    a.file_format,
    a.content_md,
    a.byte_size,
    a.version_number,
    a.position,
    a.created_at,
    a.updated_at,
  );
  touchManuscript(opts.manuscriptId);
  return a;
}

export function updateAsset(
  manuscriptId: string,
  assetId: string,
  patch: {
    kind?: ManuscriptAssetKind;
    label?: string | null;
    content_md?: string;
  },
): ManuscriptAsset | undefined {
  const existing = getAsset(manuscriptId, assetId);
  if (!existing) return undefined;
  if (patch.kind !== undefined && !isValidKind(patch.kind)) {
    throw new Error(`invalid asset kind: ${patch.kind}`);
  }
  const next: ManuscriptAsset = {
    ...existing,
    kind: patch.kind ?? existing.kind,
    label: patch.label !== undefined ? (patch.label?.trim() || null) : existing.label,
    content_md: patch.content_md ?? existing.content_md,
    byte_size:
      patch.content_md !== undefined
        ? Buffer.byteLength(patch.content_md, "utf8")
        : existing.byte_size,
    updated_at: nowUnix(),
  };
  getDb()
    .prepare(
      `UPDATE manuscript_assets
          SET kind = ?, label = ?, content_md = ?, byte_size = ?, updated_at = ?
        WHERE manuscript_id = ? AND id = ?`,
    )
    .run(
      next.kind,
      next.label,
      next.content_md,
      next.byte_size,
      next.updated_at,
      manuscriptId,
      assetId,
    );
  touchManuscript(manuscriptId);
  return next;
}

export function deleteAsset(
  manuscriptId: string,
  assetId: string,
): boolean {
  const r = getDb()
    .prepare(
      `DELETE FROM manuscript_assets
        WHERE manuscript_id = ? AND id = ?`,
    )
    .run(manuscriptId, assetId);
  if (r.changes > 0) touchManuscript(manuscriptId);
  return r.changes > 0;
}

/**
 * Apply a new total order. IDs not in the provided list keep their
 * existing position, sorted after the listed IDs. Unknown IDs are
 * ignored. Atomic via transaction.
 */
export function reorderAssets(
  manuscriptId: string,
  orderedIds: string[],
): ManuscriptAssetSummary[] {
  const db = getDb();
  db.transaction(() => {
    let pos = 0;
    const upd = db.prepare(
      `UPDATE manuscript_assets
          SET position = ?, updated_at = ?
        WHERE manuscript_id = ? AND id = ?`,
    );
    const now = nowUnix();
    for (const id of orderedIds) {
      upd.run(pos++, now, manuscriptId, id);
    }
    // Anything not listed gets pushed after the ordered block, preserving
    // their relative order.
    const unlisted = db
      .prepare(
        `SELECT id FROM manuscript_assets
          WHERE manuscript_id = ? AND id NOT IN (${orderedIds.map(() => "?").join(",") || "NULL"})
          ORDER BY position ASC, created_at ASC`,
      )
      .all(manuscriptId, ...orderedIds) as Array<{ id: string }>;
    for (const u of unlisted) {
      upd.run(pos++, now, manuscriptId, u.id);
    }
  })();
  touchManuscript(manuscriptId);
  return listAssets(manuscriptId);
}
