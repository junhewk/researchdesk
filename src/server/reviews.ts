import { nanoid } from "nanoid";
import { getDb, buildAssignments } from "./db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "./manuscripts";
import { exportReview } from "./markdownExport";
import type { Review, ReviewCategory, RevisionStatus, Severity } from "./types";

export function listReviews(manuscriptId: string, opts?: {
  category?: ReviewCategory;
  status?: RevisionStatus;
}): Review[] {
  const db = getDb();
  const clauses = ["manuscript_id = ?"];
  const params: unknown[] = [manuscriptId];

  if (opts?.category) {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }

  return db
    .prepare(`SELECT * FROM reviews WHERE ${clauses.join(" AND ")} ORDER BY created_at`)
    .all(...params) as Review[];
}

export function getReview(id: string): Review | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Review | undefined;
}

export function createReview(data: {
  manuscript_id: string;
  category: ReviewCategory;
  content_md: string;
  severity?: Severity;
  section_ref?: string;
}): Review {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  const r: Review = {
    id,
    manuscript_id: data.manuscript_id,
    category: data.category,
    content_md: data.content_md,
    severity: data.severity ?? null,
    section_ref: data.section_ref ?? null,
    status: "pending",
    created_at: now,
  };

  db.prepare(
    `INSERT INTO reviews (id, manuscript_id, category, content_md, severity, section_ref, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.manuscript_id, r.category, r.content_md, r.severity, r.section_ref, r.status, r.created_at);

  touchManuscript(data.manuscript_id);

  exportReview(r);
  return r;
}

export function updateReview(
  id: string,
  data: Partial<Pick<Review, "status" | "category">>,
): Review | undefined {
  const db = getDb();
  const existing = getReview(id);
  if (!existing) return undefined;

  const { sets, params } = buildAssignments(data);

  if (sets.length === 0) return existing;
  params.push(id);

  db.prepare(`UPDATE reviews SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  const updated = getReview(id)!;
  exportReview(updated);
  return updated;
}
