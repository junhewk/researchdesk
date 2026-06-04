import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "./manuscripts";
import { exportRevision } from "./markdownExport";
import type { Revision, SuggestionCategory, RevisionStatus, RevisionAction, RevisionActionType } from "./types";

export function listRevisions(manuscriptId: string, opts?: {
  round?: number;
  category?: SuggestionCategory;
  status?: RevisionStatus;
}): Revision[] {
  const db = getDb();
  const clauses = ["manuscript_id = ?"];
  const params: unknown[] = [manuscriptId];

  if (opts?.round !== undefined) {
    clauses.push("round = ?");
    params.push(opts.round);
  }
  if (opts?.category) {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }

  return db
    .prepare(`SELECT * FROM revisions WHERE ${clauses.join(" AND ")} ORDER BY created_at`)
    .all(...params) as Revision[];
}

export function getRevision(id: string): Revision | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM revisions WHERE id = ?").get(id) as Revision | undefined;
}

export function createRevision(data: {
  manuscript_id: string;
  commentary_id?: string;
  category: SuggestionCategory;
  suggestion_md: string;
  revised_md?: string;
  rewrite_context?: string;
  round?: number;
}): Revision {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  const r: Revision = {
    id,
    manuscript_id: data.manuscript_id,
    commentary_id: data.commentary_id ?? null,
    category: data.category,
    status: "pending",
    suggestion_md: data.suggestion_md,
    revised_md: data.revised_md ?? null,
    rewrite_context: data.rewrite_context ?? null,
    user_revision: null,
    round: data.round ?? 1,
    created_at: now,
    applied_at: null,
  };

  db.prepare(
    `INSERT INTO revisions (id, manuscript_id, commentary_id, category, status, suggestion_md, revised_md, rewrite_context, user_revision, round, created_at, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.manuscript_id, r.commentary_id, r.category, r.status, r.suggestion_md, r.revised_md, r.rewrite_context, r.user_revision, r.round, r.created_at, r.applied_at);

  touchManuscript(data.manuscript_id);

  exportRevision(r);
  return r;
}

export function updateRevision(
  id: string,
  data: Partial<Pick<Revision, "status" | "category" | "user_revision">>,
): Revision | undefined {
  const db = getDb();
  const existing = getRevision(id);
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (data.status === "applied") {
    sets.push("applied_at = ?");
    params.push(nowUnix());
  }

  if (sets.length === 0) return existing;
  params.push(id);

  db.prepare(`UPDATE revisions SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  const updated = getRevision(id)!;
  exportRevision(updated);
  return updated;
}

// Revision Actions

export function listRevisionActions(): RevisionAction[] {
  const db = getDb();
  return db.prepare("SELECT * FROM revision_actions ORDER BY use_count DESC, last_used_at DESC").all() as RevisionAction[];
}

export function createRevisionAction(data: {
  label: string;
  action_type: RevisionActionType;
  config_json: string;
}): RevisionAction {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  db.prepare(
    `INSERT INTO revision_actions (id, label, action_type, config_json, use_count, created_at, last_used_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL)`,
  ).run(id, data.label, data.action_type, data.config_json, now);

  return db.prepare("SELECT * FROM revision_actions WHERE id = ?").get(id) as RevisionAction;
}

export function incrementRevisionActionUse(id: string): void {
  const db = getDb();
  db.prepare("UPDATE revision_actions SET use_count = use_count + 1, last_used_at = ? WHERE id = ?").run(nowUnix(), id);
}
