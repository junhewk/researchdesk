import { getDb } from "./db";
import type { SearchResult, EntityType } from "./types";

interface SearchOptions {
  query: string;
  type?: EntityType;
  research_domain?: string;
  journal_type?: string;
  category?: string;
  status?: string;
  limit?: number;
}

export function searchCommentaries(opts: SearchOptions): SearchResult[] {
  const db = getDb();
  const limit = opts.limit ?? 10;

  const rows = db.prepare(`
    SELECT c.id, snippet(commentaries_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
           rank
    FROM commentaries_fts
    JOIN commentaries c ON c.rowid = commentaries_fts.rowid
    JOIN manuscripts m ON m.id = c.manuscript_id
    WHERE commentaries_fts MATCH ?
    ${opts.research_domain ? "AND m.research_domain = ?" : ""}
    ${opts.journal_type ? "AND m.journal_type = ?" : ""}
    ORDER BY rank
    LIMIT ?
  `).all(
    ...[opts.query, opts.research_domain, opts.journal_type, limit].filter((v): v is string | number => v !== undefined),
  ) as Array<{ id: string; snippet: string; rank: number }>;

  return rows.map((r) => ({
    id: r.id,
    type: "commentary" as EntityType,
    snippet: r.snippet,
    rank: r.rank,
  }));
}

export function searchRevisions(opts: SearchOptions): SearchResult[] {
  const db = getDb();
  const limit = opts.limit ?? 10;

  const params: (string | number)[] = [opts.query];
  const conditions: string[] = [];

  if (opts.category) {
    conditions.push("r.category = ?");
    params.push(opts.category);
  }
  if (opts.status) {
    conditions.push("r.status = ?");
    params.push(opts.status);
  }

  const where = conditions.length ? "AND " + conditions.join(" AND ") : "";
  params.push(limit);

  const rows = db.prepare(`
    SELECT r.id, snippet(revisions_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
           rank
    FROM revisions_fts
    JOIN revisions r ON r.rowid = revisions_fts.rowid
    WHERE revisions_fts MATCH ?
    ${where}
    ORDER BY rank
    LIMIT ?
  `).all(...params) as Array<{ id: string; snippet: string; rank: number }>;

  return rows.map((r) => ({
    id: r.id,
    type: "revision" as EntityType,
    snippet: r.snippet,
    rank: r.rank,
  }));
}

export function searchReviews(opts: SearchOptions): SearchResult[] {
  const db = getDb();
  const limit = opts.limit ?? 10;

  const params: (string | number)[] = [opts.query];
  const conditions: string[] = [];

  if (opts.category) {
    conditions.push("r.category = ?");
    params.push(opts.category);
  }
  if (opts.research_domain) {
    conditions.push("m.research_domain = ?");
    params.push(opts.research_domain);
  }

  const where = conditions.length ? "AND " + conditions.join(" AND ") : "";
  params.push(limit);

  const rows = db.prepare(`
    SELECT r.id, snippet(reviews_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
           rank
    FROM reviews_fts
    JOIN reviews r ON r.rowid = reviews_fts.rowid
    ${opts.research_domain ? "JOIN manuscripts m ON m.id = r.manuscript_id" : ""}
    WHERE reviews_fts MATCH ?
    ${where}
    ORDER BY rank
    LIMIT ?
  `).all(...params) as Array<{ id: string; snippet: string; rank: number }>;

  return rows.map((r) => ({
    id: r.id,
    type: "review" as EntityType,
    snippet: r.snippet,
    rank: r.rank,
  }));
}

export function searchManuscripts(query: string, limit: number = 10): SearchResult[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT m.id, snippet(manuscripts_fts, 0, '<mark>', '</mark>', '...', 40) as snippet,
           rank
    FROM manuscripts_fts
    JOIN manuscripts m ON m.rowid = manuscripts_fts.rowid
    WHERE manuscripts_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<{ id: string; snippet: string; rank: number }>;

  return rows.map((r) => ({
    id: r.id,
    type: "manuscript" as EntityType,
    snippet: r.snippet,
    rank: r.rank,
  }));
}
