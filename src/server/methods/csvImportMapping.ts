import { z } from "zod";
import { parseCsvRows } from "@/server/csv";
import { runStructured, truncateForPrompt } from "@/server/apiAgent/structuredRunner";
import type { ApiAgentConfig } from "@/server/apiAgent/providers";
import type { ScreeningDecision } from "@/server/types";

export const CSV_RECORD_FIELDS = [
  "external_id",
  "title",
  "authors",
  "year",
  "journal",
  "volume",
  "issue",
  "pages",
  "doi",
  "pmid",
  "scopus_eid",
  "wos_uid",
  "cinahl_an",
  "abstract",
  "keywords",
  "language",
  "url",
  "source_databases",
  "screen_stage",
  "screen_tier",
  "screen_reason",
  "screen_confidence",
  "ai_final",
  "ai_final_reason",
] as const;

export type CsvRecordField = (typeof CSV_RECORD_FIELDS)[number];

const decisionSchema = z.enum(["include", "exclude", "maybe", "unscreened"]);

export interface CsvImportMapping {
  fields: Partial<Record<CsvRecordField, string | null>>;
  decision: {
    column: string | null;
    values: Record<string, ScreeningDecision>;
    default_decision: ScreeningDecision;
  };
  needs_review: {
    column: string | null;
    true_values: string[];
  };
  confidence: "high" | "medium" | "low";
  rationale_md: string;
  warnings: string[];
}

export const CsvImportMappingSchema = z.object({
  fields: z.record(z.string(), z.string().nullable()).default({}),
  decision: z.object({
    column: z.string().nullable().default(null),
    values: z.record(z.string(), decisionSchema).default({}),
    default_decision: decisionSchema.default("unscreened"),
  }).default({ column: null, values: {}, default_decision: "unscreened" }),
  needs_review: z.object({
    column: z.string().nullable().default(null),
    true_values: z.array(z.string()).default(["Y", "Yes", "true", "1"]),
  }).default({ column: null, true_values: ["Y", "Yes", "true", "1"] }),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  rationale_md: z.string().default(""),
  warnings: z.array(z.string()).default([]),
}) as z.ZodType<CsvImportMapping>;

export interface CsvImportPreviewFile {
  filename: string;
  kind: "search" | "records";
  row_count: number;
  headers: string[];
  sample_rows: Record<string, string>[];
  value_profile: Record<string, string[]>;
  mapping?: CsvImportMapping;
  warning?: string | null;
}

export interface CsvImportPreview {
  files: CsvImportPreviewFile[];
}

export function detectCsvImportKind(rows: string[][]): "search" | "records" {
  const first = (rows[0]?.[0] ?? "").trim().toLowerCase().replace(/^\ufeff/, "");
  return new Set(["rq", "p", "population", "c", "concept", "context", "co", "search"]).has(first)
    ? "search"
    : "records";
}

export function parseCsvForImport(text: string): string[][] {
  return parseCsvRows(text);
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/^\ufeff/, "");
}

function rowObjects(rows: string[][], limit = 20): Record<string, string>[] {
  const headers = (rows[0] ?? []).map(normalizeHeader);
  return rows.slice(1, limit + 1).map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => {
      out[h] = (row[i] ?? "").trim();
    });
    return out;
  });
}

export function buildValueProfile(
  rows: string[][],
  opts: { maxColumns?: number; maxValues?: number } = {},
): Record<string, string[]> {
  const maxColumns = opts.maxColumns ?? 40;
  const maxValues = opts.maxValues ?? 24;
  const headers = (rows[0] ?? []).map(normalizeHeader).slice(0, maxColumns);
  const values: Record<string, Set<string>> = {};
  for (const h of headers) values[h] = new Set<string>();
  for (const row of rows.slice(1)) {
    headers.forEach((h, i) => {
      const value = (row[i] ?? "").trim();
      if (!value || value.length > 80) return;
      if (values[h].size < maxValues) values[h].add(value);
    });
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, set]) => [key, Array.from(set)]),
  );
}

function sanitizeColumn(column: string | null | undefined, headerSet: Set<string>): string | null {
  if (!column) return null;
  const trimmed = column.trim();
  return headerSet.has(trimmed) ? trimmed : null;
}

export function sanitizeCsvImportMapping(
  mapping: unknown,
  headers: string[],
): CsvImportMapping {
  const headerSet = new Set(headers.map(normalizeHeader));
  const parsed = CsvImportMappingSchema.parse(mapping);
  const fields: Partial<Record<CsvRecordField, string | null>> = {};
  for (const field of CSV_RECORD_FIELDS) {
    const column = sanitizeColumn(parsed.fields[field], headerSet);
    if (column) fields[field] = column;
  }

  const decisionColumn = sanitizeColumn(parsed.decision.column, headerSet);
  const values: Record<string, ScreeningDecision> = {};
  for (const [raw, decision] of Object.entries(parsed.decision.values)) {
    const key = raw.trim();
    if (key) values[key] = decision;
  }

  return {
    fields,
    decision: {
      column: decisionColumn,
      values,
      default_decision: parsed.decision.default_decision,
    },
    needs_review: {
      column: sanitizeColumn(parsed.needs_review.column, headerSet),
      true_values: parsed.needs_review.true_values.map((v) => v.trim()).filter(Boolean),
    },
    confidence: parsed.confidence,
    rationale_md: parsed.rationale_md,
    warnings: parsed.warnings,
  };
}

function localHeuristicMapping(headers: string[], valueProfile: Record<string, string[]>): CsvImportMapping {
  const byNorm = new Map(headers.map((h) => [h.toLowerCase().replace(/[^a-z0-9]+/g, ""), h]));
  const field = (...names: string[]) => {
    for (const n of names) {
      const found = byNorm.get(n.toLowerCase().replace(/[^a-z0-9]+/g, ""));
      if (found) return found;
    }
    return null;
  };
  const decisionColumn =
    field("final", "decision", "screeningdecision", "include", "included", "screen_tier", "tier", "category") ??
    null;
  const decisionValues: Record<string, ScreeningDecision> = {};
  for (const value of decisionColumn ? valueProfile[decisionColumn] ?? [] : []) {
    const v = value.trim().toLowerCase();
    if (/^(y|yes|include|included|primary)$/.test(v)) decisionValues[value] = "include";
    else if (/^(n|no|exclude|excluded)$/.test(v)) decisionValues[value] = "exclude";
    else if (/^(maybe|unclear|secondary|reserve|review)$/.test(v)) decisionValues[value] = "maybe";
    else decisionValues[value] = "unscreened";
  }
  return {
    fields: {
      external_id: field("record_id", "id"),
      title: field("title", "name"),
      authors: field("authors", "author"),
      year: field("year", "publicationyear"),
      journal: field("journal", "source"),
      volume: field("volume"),
      issue: field("issue"),
      pages: field("pages"),
      doi: field("doi"),
      pmid: field("pmid"),
      scopus_eid: field("scopuseid", "scopus_eid"),
      wos_uid: field("wosuid", "wos_uid"),
      cinahl_an: field("cinahlan", "cinahl_an"),
      abstract: field("abstract"),
      keywords: field("keywords"),
      language: field("language"),
      url: field("url"),
      source_databases: field("sourcedatabases", "source_databases", "databases"),
      screen_stage: field("screenstage", "screen_stage"),
      screen_tier: field("screentier", "screen_tier", "tier", "category"),
      screen_reason: field("screenreason", "screen_reason", "reason"),
      screen_confidence: field("screenconfidence", "screen_confidence", "confidence"),
      ai_final: field("final", "aifinal", "ai_final"),
      ai_final_reason: field("finalreason", "ai_final_reason"),
    },
    decision: {
      column: decisionColumn,
      values: decisionValues,
      default_decision: "unscreened",
    },
    needs_review: {
      column: field("needsreview", "needs_review"),
      true_values: ["Y", "Yes", "true", "1"],
    },
    confidence: decisionColumn ? "medium" : "low",
    rationale_md: decisionColumn
      ? `Initial local guess: use "${decisionColumn}" as the decision/category column.`
      : "No obvious decision/category column was found.",
    warnings: decisionColumn ? [] : ["No usable decision/category column was detected."],
  };
}

export async function interpretRecordCsvMapping(opts: {
  filename: string;
  rows: string[][];
  config: ApiAgentConfig;
}): Promise<CsvImportPreviewFile> {
  const headers = (opts.rows[0] ?? []).map(normalizeHeader);
  const sampleRows = rowObjects(opts.rows, 20);
  const valueProfile = buildValueProfile(opts.rows);
  const heuristic = localHeuristicMapping(headers, valueProfile);

  const result = await runStructured({
    config: opts.config,
    schema: CsvImportMappingSchema,
    schemaName: "CsvImportMapping",
    temperature: 0,
    systemPrompt: [
      "You help a researcher import a scoping-review screening CSV.",
      "Infer what each CSV column means from headers and sample values.",
      "Do not screen or classify records from title/abstract text.",
      "Only map columns that are present exactly as named in the provided headers.",
      "For decision values, map source values to include/exclude/maybe/unscreened only when the CSV's own category/decision value supports that interpretation.",
      "If no decision/category column is usable, leave decision.column null and warn the user.",
    ].join("\n"),
    userPrompt: truncateForPrompt([
      `Filename: ${opts.filename}`,
      "",
      "Canonical app fields:",
      CSV_RECORD_FIELDS.join(", "),
      "",
      "Headers:",
      JSON.stringify(headers),
      "",
      "Short unique values by column:",
      JSON.stringify(valueProfile, null, 2),
      "",
      "Sample rows:",
      JSON.stringify(sampleRows, null, 2),
      "",
      "Local heuristic guess to improve or correct:",
      JSON.stringify(heuristic, null, 2),
    ].join("\n"), 60_000),
  });

  return {
    filename: opts.filename,
    kind: "records",
    row_count: Math.max(0, opts.rows.length - 1),
    headers,
    sample_rows: sampleRows.slice(0, 5),
    value_profile: valueProfile,
    mapping: sanitizeCsvImportMapping(result.parsed, headers),
    warning: null,
  };
}

export function previewSearchCsv(filename: string, rows: string[][]): CsvImportPreviewFile {
  return {
    filename,
    kind: "search",
    row_count: Math.max(0, rows.length - 1),
    headers: (rows[0] ?? []).map(normalizeHeader),
    sample_rows: rowObjects(rows, 5),
    value_profile: buildValueProfile(rows),
    warning: "Search-process CSVs are imported directly after you approve the import.",
  };
}
