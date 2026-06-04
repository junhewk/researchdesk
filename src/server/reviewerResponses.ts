import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { getManuscript, touchManuscript } from "./manuscripts";
import { getCommentary, listCommentaries } from "./commentaries";
import { createAsset } from "./manuscriptAssets";
import type {
  ManuscriptAsset,
  ReviewerResponse,
  ReviewerResponseItem,
  ReviewerResponseItemStatus,
  ReviewerResponseStatus,
} from "./types";

export function getReviewerResponse(
  responseId: string,
): ReviewerResponse | undefined {
  return getDb()
    .prepare("SELECT * FROM reviewer_responses WHERE id = ?")
    .get(responseId) as ReviewerResponse | undefined;
}

export function listReviewerResponses(
  manuscriptId: string,
): ReviewerResponse[] {
  return getDb()
    .prepare(
      `SELECT * FROM reviewer_responses
       WHERE manuscript_id = ?
       ORDER BY round DESC, updated_at DESC`,
    )
    .all(manuscriptId) as ReviewerResponse[];
}

export function listResponseItems(
  responseId: string,
): ReviewerResponseItem[] {
  return getDb()
    .prepare(
      `SELECT * FROM reviewer_response_items
       WHERE response_id = ?
       ORDER BY position ASC, created_at ASC`,
    )
    .all(responseId) as ReviewerResponseItem[];
}

export function getResponseItem(
  itemId: string,
): ReviewerResponseItem | undefined {
  return getDb()
    .prepare("SELECT * FROM reviewer_response_items WHERE id = ?")
    .get(itemId) as ReviewerResponseItem | undefined;
}

export function createResponse(opts: {
  manuscriptId: string;
  round: number;
  sessionId?: string | null;
  decisionLetterCommentaryId?: string | null;
}): ReviewerResponse {
  if (!getManuscript(opts.manuscriptId)) {
    throw new Error("manuscript not found");
  }
  const db = getDb();
  const now = nowUnix();
  const id = `rr_${nanoid(16)}`;
  const r: ReviewerResponse = {
    id,
    manuscript_id: opts.manuscriptId,
    session_id: opts.sessionId ?? null,
    round: opts.round,
    decision_letter_commentary_id: opts.decisionLetterCommentaryId ?? null,
    status: "drafting",
    summary_md: null,
    compiled_asset_id: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO reviewer_responses
       (id, manuscript_id, session_id, round, decision_letter_commentary_id,
        status, summary_md, compiled_asset_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.manuscript_id,
    r.session_id,
    r.round,
    r.decision_letter_commentary_id,
    r.status,
    r.summary_md,
    r.compiled_asset_id,
    r.created_at,
    r.updated_at,
  );
  touchManuscript(opts.manuscriptId);
  return r;
}

function nextPosition(responseId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max
         FROM reviewer_response_items
        WHERE response_id = ?`,
    )
    .get(responseId) as { max: number };
  return (row.max ?? -1) + 1;
}

export function addResponseItem(opts: {
  responseId: string;
  commentaryId?: string | null;
  comment_excerpt: string;
  response_md?: string | null;
  change_pointer_md?: string | null;
  revision_ids_json?: string | null;
}): ReviewerResponseItem | undefined {
  const response = getReviewerResponse(opts.responseId);
  if (!response) return undefined;
  const db = getDb();
  const now = nowUnix();
  const id = `rri_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO reviewer_response_items
       (id, response_id, commentary_id, comment_excerpt, response_md,
        change_pointer_md, revision_ids_json, status, position,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.responseId,
    opts.commentaryId ?? null,
    opts.comment_excerpt,
    opts.response_md ?? null,
    opts.change_pointer_md ?? null,
    opts.revision_ids_json ?? null,
    "drafting",
    nextPosition(opts.responseId),
    now,
    now,
  );
  db.prepare(
    "UPDATE reviewer_responses SET updated_at = ? WHERE id = ?",
  ).run(now, opts.responseId);
  touchManuscript(response.manuscript_id);
  return getResponseItem(id);
}

export function updateResponseItem(
  itemId: string,
  patch: {
    response_md?: string | null;
    change_pointer_md?: string | null;
    revision_ids_json?: string | null;
    status?: ReviewerResponseItemStatus;
  },
): ReviewerResponseItem | undefined {
  const existing = getResponseItem(itemId);
  if (!existing) return undefined;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    params.push(v);
  }
  if (sets.length === 0) return existing;
  const now = nowUnix();
  sets.push("updated_at = ?");
  params.push(now, itemId);
  getDb()
    .prepare(
      `UPDATE reviewer_response_items SET ${sets.join(", ")} WHERE id = ?`,
    )
    .run(...params);
  return getResponseItem(itemId);
}

export function updateResponse(
  responseId: string,
  patch: {
    status?: ReviewerResponseStatus;
    summary_md?: string | null;
    compiled_asset_id?: string | null;
  },
): ReviewerResponse | undefined {
  const existing = getReviewerResponse(responseId);
  if (!existing) return undefined;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    params.push(v);
  }
  if (sets.length === 0) return existing;
  const now = nowUnix();
  sets.push("updated_at = ?");
  params.push(now, responseId);
  getDb()
    .prepare(`UPDATE reviewer_responses SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  touchManuscript(existing.manuscript_id);
  return getReviewerResponse(responseId);
}

/**
 * Seed response items from each numbered point in the reviewer commentaries.
 * Splits on common numbering patterns ("1.", "(1)", "Reviewer 2 — Point 3").
 * If no obvious numbering is found, falls back to one item per paragraph.
 */
export function seedFromLetters(
  responseId: string,
): { seeded: number } {
  const response = getReviewerResponse(responseId);
  if (!response) return { seeded: 0 };

  const commentaries = listCommentaries(response.manuscript_id);
  const reviewerComments = commentaries.filter(
    (c) =>
      c.source === "reviewer_report" ||
      c.source === "decision_letter",
  );

  let seeded = 0;
  for (const c of reviewerComments) {
    const points = splitIntoPoints(c.content_md);
    for (const excerpt of points) {
      const trimmed = excerpt.trim();
      if (!trimmed) continue;
      addResponseItem({
        responseId,
        commentaryId: c.id,
        comment_excerpt: trimmed,
      });
      seeded += 1;
    }
  }
  return { seeded };
}

function splitIntoPoints(text: string): string[] {
  // Try numbered-list pattern first.
  const numbered = text.match(/(?:^|\n)\s*(?:\d+[.)]|\(\d+\))[^\n]*(?:\n(?!\s*(?:\d+[.)]|\(\d+\))).*)*/g);
  if (numbered && numbered.length >= 2) return numbered.map((s) => s.trim());

  // Fall back to paragraph split.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [text];
}

/**
 * Compile the response into a single response_letter asset on the manuscript.
 * Returns the created asset and marks the response as 'ready'.
 */
export function compileLetter(responseId: string): {
  asset: ManuscriptAsset;
  response: ReviewerResponse;
} {
  const response = getReviewerResponse(responseId);
  if (!response) throw new Error("response not found");
  const items = listResponseItems(responseId);

  const lines: string[] = [
    `# Response to Reviewers (Round ${response.round})`,
    "",
    response.summary_md?.trim() ? `${response.summary_md.trim()}\n` : "",
  ];

  // Group items by source commentary (e.g. Reviewer 1, Reviewer 2)
  const byCommentary = new Map<string, ReviewerResponseItem[]>();
  for (const it of items) {
    const key = it.commentary_id ?? "_other";
    const arr = byCommentary.get(key) ?? [];
    arr.push(it);
    byCommentary.set(key, arr);
  }

  let groupIdx = 1;
  for (const [commentaryId, list] of byCommentary.entries()) {
    let label = `Reviewer ${groupIdx++}`;
    if (commentaryId !== "_other") {
      const c = getCommentary(commentaryId);
      if (c?.reviewer_label) label = c.reviewer_label;
      else if (c?.source === "decision_letter") label = "Editor";
    }
    lines.push(`## ${label}`, "");
    list.forEach((it, idx) => {
      lines.push(`### Point ${idx + 1}`);
      lines.push("");
      lines.push("> " + it.comment_excerpt.replace(/\n/g, "\n> "));
      lines.push("");
      if (it.response_md) {
        lines.push(it.response_md);
        lines.push("");
      } else {
        lines.push("_(no response drafted)_");
        lines.push("");
      }
      if (it.change_pointer_md) {
        lines.push(`**Change:** ${it.change_pointer_md}`);
        lines.push("");
      }
    });
  }

  const content_md = lines.join("\n");
  const asset = createAsset({
    manuscriptId: response.manuscript_id,
    kind: "response_letter",
    label: `Response to reviewers (Round ${response.round})`,
    original_file: `response_letter_round_${response.round}.md`,
    file_format: "md",
    content_md,
  });

  const updated = updateResponse(responseId, {
    status: "ready",
    compiled_asset_id: asset.id,
  })!;

  return { asset, response: updated };
}
