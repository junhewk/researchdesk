import { nanoid } from "nanoid";
import { getDb } from "../db";
import { nowUnix } from "@/lib/utils";
import { parseCsvRows, toCsv } from "../csv";
import { getStudy, getDecision, patchDecision, updateStudy, touchStudy } from "../studies";
import {
  detectCsvImportKind,
  normalizeHeader,
  sanitizeCsvImportMapping,
  type CsvImportMapping,
  type CsvRecordField,
} from "./csvImportMapping";
import type {
  PrismaFlow,
  ReviewRecord,
  ReviewSearch,
  ScreeningDecision,
} from "../types";

// ===========================================================================
// Review corpus: search yields (review_searches) + a screened-record table
// (review_records), populated by CSV import. Two CSV shapes are supported and
// auto-detected:
//
//   1. "search process" — a row-typed protocol file. Col A is a tag:
//        RQ / P / C / Context / search, then one row per database whose col B
//        is the Boolean query and col C the yield. Populates the scoping cards
//        (review_question PCC, information_sources, search_strategy) and the
//        review_searches table.
//   2. "records" — a wide header file (record_id,title,authors,…,final). One
//        row per screened study; the screen_* / final columns are kept verbatim
//        and a confirmable `decision` is seeded from them.
//
// v1 screening is confirm-only: nothing here calls a model. The user confirms
// or overrides `decision` per record in the screening UI.
// ===========================================================================

// --------------------------------------------------------------------------
// Searches
// --------------------------------------------------------------------------

export function listSearches(studyId: string): ReviewSearch[] {
  return getDb()
    .prepare("SELECT * FROM review_searches WHERE study_id = ? ORDER BY position")
    .all(studyId) as ReviewSearch[];
}

/** Replace the whole search-yield set for a study (import is authoritative). */
export function replaceSearches(
  studyId: string,
  searches: Array<{
    database: string;
    query_text: string | null;
    yield_count: number;
    search_date: string | null;
  }>,
): void {
  const db = getDb();
  const now = nowUnix();
  db.transaction(() => {
    db.prepare("DELETE FROM review_searches WHERE study_id = ?").run(studyId);
    const insert = db.prepare(
      `INSERT INTO review_searches
         (id, study_id, database, query_text, yield_count, search_date, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    searches.forEach((s, i) => {
      insert.run(
        `rs_${nanoid(16)}`,
        studyId,
        s.database,
        s.query_text,
        Math.max(0, Math.round(s.yield_count) || 0),
        s.search_date,
        i,
        now,
      );
    });
  })();
  touchStudy(studyId);
}

// --------------------------------------------------------------------------
// Records
// --------------------------------------------------------------------------

interface RecordRow {
  id: string;
  study_id: string;
  external_id: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  pmid: string | null;
  other_ids_json: string | null;
  abstract: string | null;
  keywords: string | null;
  language: string | null;
  url: string | null;
  source_databases: string | null;
  screen_stage: string | null;
  screen_tier: string | null;
  screen_reason: string | null;
  screen_confidence: string | null;
  needs_review: number;
  ai_final: string | null;
  ai_final_reason: string | null;
  decision: ScreeningDecision;
  decision_reason: string | null;
  user_confirmed: number;
  charting_json: string | null;
  dedupe_key: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

function rowToRecord(row: RecordRow): ReviewRecord {
  return {
    ...row,
    needs_review: Boolean(row.needs_review),
    user_confirmed: Boolean(row.user_confirmed),
  };
}

export interface RecordFilters {
  decision?: ScreeningDecision;
  tier?: string;
  confidence?: string;
  needs_review?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listRecords(
  studyId: string,
  filters: RecordFilters = {},
): { records: ReviewRecord[]; total: number } {
  const db = getDb();
  const clauses = ["study_id = ?"];
  const params: unknown[] = [studyId];
  if (filters.decision) {
    clauses.push("decision = ?");
    params.push(filters.decision);
  }
  if (filters.tier) {
    clauses.push("screen_tier = ?");
    params.push(filters.tier);
  }
  if (filters.confidence) {
    clauses.push("screen_confidence = ?");
    params.push(filters.confidence);
  }
  if (filters.needs_review !== undefined) {
    clauses.push("needs_review = ?");
    params.push(filters.needs_review ? 1 : 0);
  }
  if (filters.q && filters.q.trim()) {
    clauses.push("(title LIKE ? OR authors LIKE ? OR abstract LIKE ?)");
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM review_records ${where}`).get(...params) as {
      n: number;
    }
  ).n;
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM review_records ${where} ORDER BY position LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as RecordRow[];
  return { records: rows.map(rowToRecord), total };
}

export function getRecord(id: string): ReviewRecord | undefined {
  const row = getDb()
    .prepare("SELECT * FROM review_records WHERE id = ?")
    .get(id) as RecordRow | undefined;
  return row ? rowToRecord(row) : undefined;
}

/** Counts by decision + how many are user-confirmed, for the screening header. */
export function recordStats(studyId: string): {
  total: number;
  include: number;
  exclude: number;
  maybe: number;
  unscreened: number;
  confirmed: number;
  needs_review: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT decision, COUNT(*) AS n,
              SUM(user_confirmed) AS confirmed,
              SUM(needs_review) AS needs_review
         FROM review_records WHERE study_id = ? GROUP BY decision`,
    )
    .all(studyId) as Array<{
    decision: ScreeningDecision;
    n: number;
    confirmed: number;
    needs_review: number;
  }>;
  const out = {
    total: 0,
    include: 0,
    exclude: 0,
    maybe: 0,
    unscreened: 0,
    confirmed: 0,
    needs_review: 0,
  };
  for (const r of rows) {
    out.total += r.n;
    out.confirmed += r.confirmed ?? 0;
    out.needs_review += r.needs_review ?? 0;
    if (r.decision in out) (out as Record<string, number>)[r.decision] = r.n;
  }
  return out;
}

export function patchRecord(
  id: string,
  patch: {
    decision?: ScreeningDecision;
    decision_reason?: string | null;
    user_confirmed?: boolean;
    charting_json?: string | null;
  },
): ReviewRecord | undefined {
  const db = getDb();
  const existing = getRecord(id);
  if (!existing) return undefined;
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.decision !== undefined) {
    sets.push("decision = ?");
    params.push(patch.decision);
  }
  if (patch.decision_reason !== undefined) {
    sets.push("decision_reason = ?");
    params.push(patch.decision_reason);
  }
  if (patch.user_confirmed !== undefined) {
    sets.push("user_confirmed = ?");
    params.push(patch.user_confirmed ? 1 : 0);
  }
  if (patch.charting_json !== undefined) {
    sets.push("charting_json = ?");
    params.push(patch.charting_json);
  }
  if (sets.length === 0) return existing;
  sets.push("updated_at = ?");
  params.push(nowUnix(), id);
  db.prepare(`UPDATE review_records SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  touchStudy(existing.study_id);
  return getRecord(id);
}

/** Apply a decision (and optional confirmation) to many records at once,
 * either by explicit ids or by the current filter set. Returns count changed. */
export function bulkPatch(
  studyId: string,
  opts: {
    ids?: string[];
    filter?: RecordFilters;
    decision?: ScreeningDecision;
    user_confirmed?: boolean;
  },
): number {
  const db = getDb();
  const sets: string[] = [];
  const setParams: unknown[] = [];
  if (opts.decision !== undefined) {
    sets.push("decision = ?");
    setParams.push(opts.decision);
  }
  if (opts.user_confirmed !== undefined) {
    sets.push("user_confirmed = ?");
    setParams.push(opts.user_confirmed ? 1 : 0);
  }
  if (sets.length === 0) return 0;
  sets.push("updated_at = ?");
  setParams.push(nowUnix());

  let scope = "study_id = ?";
  const scopeParams: unknown[] = [studyId];
  if (opts.ids && opts.ids.length) {
    scope += ` AND id IN (${opts.ids.map(() => "?").join(", ")})`;
    scopeParams.push(...opts.ids);
  } else if (opts.filter) {
    const f = opts.filter;
    if (f.decision) {
      scope += " AND decision = ?";
      scopeParams.push(f.decision);
    }
    if (f.tier) {
      scope += " AND screen_tier = ?";
      scopeParams.push(f.tier);
    }
    if (f.confidence) {
      scope += " AND screen_confidence = ?";
      scopeParams.push(f.confidence);
    }
    if (f.needs_review !== undefined) {
      scope += " AND needs_review = ?";
      scopeParams.push(f.needs_review ? 1 : 0);
    }
  }
  const changes = db
    .prepare(`UPDATE review_records SET ${sets.join(", ")} WHERE ${scope}`)
    .run(...setParams, ...scopeParams).changes;
  if (changes > 0) touchStudy(studyId);
  return changes;
}

// --------------------------------------------------------------------------
// Import
// --------------------------------------------------------------------------

export type ImportKind = "search" | "records";

export interface ImportResult {
  kind: ImportKind;
  searches?: number;
  records?: number;
  inserted?: number;
  updated?: number;
  duplicates?: number;
}

const PCC_POPULATION = new Set(["p", "population"]);
const PCC_CONCEPT = new Set(["c", "concept"]);
const PCC_CONTEXT = new Set(["context", "co"]);

function detectKind(rows: string[][]): ImportKind {
  return detectCsvImportKind(rows);
}

/** `260618` → `2026-06-18`. Returns the raw token if it is not a YYMMDD. */
function parseSearchDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{6}$/.test(t)) {
    return `20${t.slice(0, 2)}-${t.slice(2, 4)}-${t.slice(4, 6)}`;
  }
  return t;
}

function setCard(
  studyId: string,
  cardType: string,
  value: string,
  fields: Record<string, string>,
): void {
  // Only patch cards that exist for this study's mode (scoping/systematic both
  // have review_question / information_sources / search_strategy).
  if (!getDecision(studyId, cardType)) return;
  patchDecision(studyId, cardType, {
    value_json: JSON.stringify({ value, fields }),
    state: "drafted",
  });
}

function importSearchProcess(studyId: string, rows: string[][]): ImportResult {
  let rq = "";
  const populations: string[] = [];
  const concepts: string[] = [];
  const contexts: string[] = [];
  let searchDate = "";
  const searches: Array<{
    database: string;
    query_text: string | null;
    yield_count: number;
    search_date: string | null;
  }> = [];

  for (const row of rows) {
    const tag = (row[0] ?? "").trim();
    if (!tag) continue;
    const tagLc = tag.toLowerCase();
    const colB = (row[1] ?? "").trim();
    if (tagLc === "rq") {
      rq = colB;
    } else if (PCC_POPULATION.has(tagLc)) {
      if (colB) populations.push(colB);
    } else if (PCC_CONCEPT.has(tagLc)) {
      if (colB) concepts.push(colB);
    } else if (PCC_CONTEXT.has(tagLc)) {
      if (colB) contexts.push(colB);
    } else if (tagLc === "search") {
      searchDate = parseSearchDate(colB);
    } else {
      // Any other non-empty tag with a query body is a database search row.
      const query = (row[1] ?? "").trim();
      const yieldRaw = (row[2] ?? "").trim();
      if (!query && !yieldRaw) continue;
      searches.push({
        database: tag,
        query_text: query || null,
        yield_count: parseInt(yieldRaw.replace(/[^\d]/g, ""), 10) || 0,
        search_date: searchDate || null,
      });
    }
  }

  // Write the protocol cards + study research question.
  if (rq) updateStudy(studyId, { research_question: rq });
  setCard(studyId, "review_question", rq, {
    population: populations.join("; "),
    concept: concepts.join("; "),
    context: contexts.join("; "),
  });
  if (searches.length || searchDate) {
    setCard(studyId, "information_sources", "", {
      databases: searches.map((s) => s.database).join(", "),
      date: searchDate,
    });
  }
  if (searches.length) {
    const strategy = searches
      .map((s) => `### ${s.database} (${s.yield_count})\n\n${s.query_text ?? ""}`)
      .join("\n\n");
    setCard(studyId, "search_strategy", strategy, { strategy, limits: "" });
    replaceSearches(studyId, searches);
  }

  return { kind: "search", searches: searches.length };
}

function normalizeKey(s: string): string {
  return s.replace(/^\ufeff/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function header(row: string[]): Map<string, number> {
  const m = new Map<string, number>();
  row.forEach((h, i) => {
    const key = normalizeKey(h);
    if (key && !m.has(key)) m.set(key, i);
  });
  return m;
}

function seedDecision(aiFinal: string): ScreeningDecision {
  const f = aiFinal.trim().toUpperCase();
  if (f === "Y" || f === "YES" || f === "INCLUDE") return "include";
  if (f === "N" || f === "NO" || f === "EXCLUDE") return "exclude";
  return "unscreened";
}

function importRecords(
  studyId: string,
  rows: string[][],
  mapping?: CsvImportMapping,
  opts: { overwriteConfirmed?: boolean } = {},
): ImportResult {
  const head = header(rows[0]);
  const headers = (rows[0] ?? []).map(normalizeHeader);
  const safeMapping = mapping ? sanitizeCsvImportMapping(mapping, headers) : null;
  const get = (row: string[], ...names: string[]): string => {
    for (const n of names) {
      const idx = head.get(normalizeKey(n));
      if (idx !== undefined) {
        const v = (row[idx] ?? "").trim();
        if (v) return v;
      }
    }
    return "";
  };
  const mapped = (row: string[], field: CsvRecordField, ...fallbacks: string[]): string => {
    const column = safeMapping?.fields[field];
    if (column) return get(row, column);
    return get(row, ...fallbacks);
  };
  const needsReviewTruthy = new Set(
    (safeMapping?.needs_review.true_values ?? ["Y", "Yes", "true", "1"])
      .map((v) => normalizeKey(v)),
  );
  const mappedNeedsReview = (row: string[]): number => {
    const raw = safeMapping?.needs_review.column
      ? get(row, safeMapping.needs_review.column)
      : get(row, "needs_review");
    if (!raw) return 0;
    return needsReviewTruthy.has(normalizeKey(raw)) ? 1 : 0;
  };
  const mappedDecision = (
    row: string[],
  ): { decision: ScreeningDecision; reason: string | null; hasDecision: boolean } => {
    const column = safeMapping?.decision.column;
    if (column) {
      const raw = get(row, column);
      if (!raw) {
        return { decision: safeMapping.decision.default_decision, reason: null, hasDecision: false };
      }
      const exact = safeMapping.decision.values[raw];
      const folded = Object.entries(safeMapping.decision.values).find(
        ([key]) => normalizeKey(key) === normalizeKey(raw),
      )?.[1];
      return {
        decision: exact ?? folded ?? safeMapping.decision.default_decision,
        reason: `Imported from ${column}: ${raw}`,
        hasDecision: true,
      };
    }
    const finalRaw = get(row, "final");
    return {
      decision: seedDecision(finalRaw),
      reason: finalRaw ? `Imported from final: ${finalRaw}` : null,
      hasDecision: Boolean(finalRaw),
    };
  };

  const db = getDb();
  const now = nowUnix();
  const startPos =
    ((db
      .prepare("SELECT MAX(position) AS p FROM review_records WHERE study_id = ?")
      .get(studyId) as { p: number | null })?.p ?? -1) + 1;

  const findByExternal = db.prepare(
    "SELECT id, decision, decision_reason, user_confirmed, charting_json FROM review_records WHERE study_id = ? AND external_id = ?",
  );
  const insert = db.prepare(
    `INSERT INTO review_records
       (id, study_id, external_id, title, authors, year, journal, volume, issue,
        pages, doi, pmid, other_ids_json, abstract, keywords, language, url,
        source_databases, screen_stage, screen_tier, screen_reason,
        screen_confidence, needs_review, ai_final, ai_final_reason, decision,
        decision_reason, user_confirmed, charting_json, dedupe_key, position,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const refresh = db.prepare(
    `UPDATE review_records SET
        title=?, authors=?, year=?, journal=?, volume=?, issue=?, pages=?,
        doi=?, pmid=?, other_ids_json=?, abstract=?, keywords=?, language=?,
        url=?, source_databases=?, screen_stage=?, screen_tier=?,
        screen_reason=?, screen_confidence=?, needs_review=?, ai_final=?,
        ai_final_reason=?, decision=?, decision_reason=?, user_confirmed=?, dedupe_key=?,
        updated_at=?
      WHERE id=?`,
  );

  let inserted = 0;
  let updated = 0;
  const seen = new Map<string, number>();
  let duplicates = 0;

  db.transaction(() => {
    rows.slice(1).forEach((row, i) => {
      if (row.every((c) => !(c ?? "").trim())) return;
      const title = mapped(row, "title", "title");
      const doi = mapped(row, "doi", "doi");
      const externalId = mapped(row, "external_id", "record_id", "id");
      const otherIds: Record<string, string> = {};
      for (const k of ["scopus_eid", "wos_uid", "cinahl_an"] as const) {
        const v = mapped(row, k, k);
        if (v) otherIds[k] = v;
      }
      const dedupeKey = normalizeKey(doi || title).slice(0, 200) || null;
      if (dedupeKey) {
        const n = (seen.get(dedupeKey) ?? 0) + 1;
        seen.set(dedupeKey, n);
        if (n > 1) duplicates++;
      }
      const yearRaw = mapped(row, "year", "year");
      const importedDecision = mappedDecision(row);
      const data = {
        study_id: studyId,
        external_id: externalId || null,
        title,
        authors: mapped(row, "authors", "authors") || null,
        year: yearRaw ? parseInt(yearRaw.replace(/[^\d]/g, ""), 10) || null : null,
        journal: mapped(row, "journal", "journal", "source") || null,
        volume: mapped(row, "volume", "volume") || null,
        issue: mapped(row, "issue", "issue") || null,
        pages: mapped(row, "pages", "pages") || null,
        doi: doi || null,
        pmid: mapped(row, "pmid", "pmid") || null,
        other_ids_json: Object.keys(otherIds).length ? JSON.stringify(otherIds) : null,
        abstract: mapped(row, "abstract", "abstract") || null,
        keywords: mapped(row, "keywords", "keywords") || null,
        language: mapped(row, "language", "language") || null,
        url: mapped(row, "url", "url") || null,
        source_databases: mapped(row, "source_databases", "source_databases", "source_database", "databases") || null,
        screen_stage: mapped(row, "screen_stage", "screen_stage") || null,
        screen_tier: mapped(row, "screen_tier", "screen_tier") || null,
        screen_reason: mapped(row, "screen_reason", "screen_reason") || null,
        screen_confidence: mapped(row, "screen_confidence", "screen_confidence") || null,
        needs_review: mappedNeedsReview(row),
        ai_final: mapped(row, "ai_final", "final") || null,
        ai_final_reason: mapped(row, "ai_final_reason", "final_reason") || null,
        dedupe_key: dedupeKey,
        updated_at: now,
      };

      const existingRow = externalId
        ? (findByExternal.get(studyId, externalId) as
            | {
                id: string;
                decision: ScreeningDecision;
                decision_reason: string | null;
                user_confirmed: number;
              }
            | undefined)
        : undefined;
      if (existingRow) {
        const updateDecision =
          importedDecision.hasDecision &&
          (opts.overwriteConfirmed || !Boolean(existingRow.user_confirmed));
        refresh.run(
          data.title, data.authors, data.year, data.journal, data.volume,
          data.issue, data.pages, data.doi, data.pmid, data.other_ids_json,
          data.abstract, data.keywords, data.language, data.url,
          data.source_databases, data.screen_stage, data.screen_tier,
          data.screen_reason, data.screen_confidence, data.needs_review,
          data.ai_final, data.ai_final_reason,
          updateDecision ? importedDecision.decision : existingRow.decision,
          updateDecision ? importedDecision.reason : existingRow.decision_reason,
          updateDecision ? 0 : existingRow.user_confirmed,
          data.dedupe_key, data.updated_at, existingRow.id,
        );
        updated++;
      } else {
        insert.run(
          `rc_${nanoid(16)}`, data.study_id, data.external_id, data.title,
          data.authors, data.year, data.journal, data.volume, data.issue,
          data.pages, data.doi, data.pmid, data.other_ids_json, data.abstract,
          data.keywords, data.language, data.url, data.source_databases,
          data.screen_stage, data.screen_tier, data.screen_reason,
          data.screen_confidence, data.needs_review, data.ai_final,
          data.ai_final_reason, importedDecision.decision, importedDecision.reason,
          0, null, data.dedupe_key, startPos + i, now, data.updated_at,
        );
        inserted++;
      }
    });
  })();
  touchStudy(studyId);

  return {
    kind: "records",
    records: inserted + updated,
    inserted,
    updated,
    duplicates,
  };
}

/** Auto-detect the CSV shape and import it. Throws on an unknown study. */
export function importScopingCsv(
  studyId: string,
  _filename: string,
  text: string,
  forceKind?: ImportKind,
): ImportResult {
  if (!getStudy(studyId)) throw new Error("study not found");
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("empty CSV");
  const kind = forceKind ?? detectKind(rows);
  return kind === "records"
    ? importRecords(studyId, rows)
    : importSearchProcess(studyId, rows);
}

export function importScopingCsvWithMapping(
  studyId: string,
  _filename: string,
  text: string,
  mapping: CsvImportMapping,
  opts: { overwriteConfirmed?: boolean } = {},
): ImportResult {
  if (!getStudy(studyId)) throw new Error("study not found");
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("empty CSV");
  if (detectKind(rows) !== "records") {
    return importSearchProcess(studyId, rows);
  }
  return importRecords(studyId, rows, mapping, opts);
}

// --------------------------------------------------------------------------
// PRISMA-ScR flow + exports
// --------------------------------------------------------------------------

export function computePrismaFlow(studyId: string): PrismaFlow {
  const searches = listSearches(studyId);
  const identified = searches.reduce((sum, s) => sum + (s.yield_count || 0), 0);
  const stats = recordStats(studyId);
  return {
    identified,
    duplicates_removed: Math.max(0, identified - stats.total),
    screened: stats.total,
    included: stats.include,
    excluded: stats.exclude,
    maybe: stats.maybe,
    pending: stats.unscreened,
    confirmed: stats.confirmed,
    per_database: searches.map((s) => ({
      database: s.database,
      yield_count: s.yield_count,
    })),
  };
}

export function renderPrismaMarkdown(studyId: string): string {
  const f = computePrismaFlow(studyId);
  const lines = [
    "# PRISMA-ScR flow",
    "",
    "## Identification",
    ...f.per_database.map((d) => `- ${d.database}: ${d.yield_count}`),
    `- **Records identified (all databases): ${f.identified}**`,
    "",
    "## Screening",
    `- Duplicates removed (derived): ${f.duplicates_removed}`,
    `- Records screened: ${f.screened}`,
    `- Records excluded: ${f.excluded}`,
    `- Records pending / unscreened: ${f.pending}`,
    `- Records flagged "maybe": ${f.maybe}`,
    "",
    "## Included",
    `- Sources of evidence included: ${f.included}`,
    `- (of which user-confirmed: ${f.confirmed})`,
  ];
  return lines.join("\n");
}

const EXPORT_COLUMNS: Array<{ header: string; key: keyof ReviewRecord }> = [
  { header: "record_id", key: "external_id" },
  { header: "title", key: "title" },
  { header: "authors", key: "authors" },
  { header: "year", key: "year" },
  { header: "journal", key: "journal" },
  { header: "doi", key: "doi" },
  { header: "pmid", key: "pmid" },
  { header: "source_databases", key: "source_databases" },
  { header: "screen_tier", key: "screen_tier" },
  { header: "screen_reason", key: "screen_reason" },
  { header: "screen_confidence", key: "screen_confidence" },
  { header: "needs_review", key: "needs_review" },
  { header: "ai_final", key: "ai_final" },
  { header: "decision", key: "decision" },
  { header: "decision_reason", key: "decision_reason" },
  { header: "user_confirmed", key: "user_confirmed" },
];

/** Round-trip export of all records + their confirmed decisions. */
export function exportRecordsCsv(studyId: string): string {
  const { records } = listRecords(studyId, { limit: 100000 });
  const headers = EXPORT_COLUMNS.map((c) => c.header);
  const rows = records.map((r) =>
    EXPORT_COLUMNS.map((c) => {
      const v = r[c.key];
      if (typeof v === "boolean") return v ? "Y" : "N";
      return v ?? "";
    }),
  );
  return toCsv(headers, rows);
}

function chartingKeys(records: ReviewRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of records) {
    if (!r.charting_json) continue;
    try {
      for (const k of Object.keys(JSON.parse(r.charting_json) as object)) keys.add(k);
    } catch {
      /* ignore malformed charting */
    }
  }
  return [...keys];
}

/** Characteristics-of-sources table for the included records, as CSV or md. */
export function renderCharacteristics(
  studyId: string,
  format: "csv" | "md",
): string {
  const included = listRecords(studyId, { decision: "include", limit: 100000 }).records;
  const extra = chartingKeys(included);
  const baseHeaders = ["record_id", "authors", "year", "title", "journal", "doi"];
  const headers = [...baseHeaders, ...extra];

  const valueFor = (r: ReviewRecord, h: string): string => {
    switch (h) {
      case "record_id":
        return r.external_id ?? "";
      case "authors":
        return r.authors ?? "";
      case "year":
        return r.year != null ? String(r.year) : "";
      case "title":
        return r.title;
      case "journal":
        return r.journal ?? "";
      case "doi":
        return r.doi ?? "";
      default: {
        if (!r.charting_json) return "";
        try {
          const c = JSON.parse(r.charting_json) as Record<string, unknown>;
          return c[h] != null ? String(c[h]) : "";
        } catch {
          return "";
        }
      }
    }
  };

  if (format === "csv") {
    return toCsv(
      headers,
      included.map((r) => headers.map((h) => valueFor(r, h))),
    );
  }
  // markdown table
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...included.map((r) => `| ${headers.map((h) => esc(valueFor(r, h))).join(" | ")} |`),
  ];
  return [`# Characteristics of included sources (${included.length})`, "", ...lines].join("\n");
}
