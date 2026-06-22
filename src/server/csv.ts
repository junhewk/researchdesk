import Papa from "papaparse";

// ===========================================================================
// Thin CSV helpers over papaparse. Used by the review-corpus importer/exporter
// (src/server/methods/reviewCorpus.ts). papaparse is pure-JS (no native build)
// and correctly handles the quoted fields with embedded commas, quotes, and
// newlines that the search-result abstracts contain.
// ===========================================================================

const BOM = String.fromCharCode(0xfeff);

/** Parse CSV text into raw string rows. Tolerant of quoted fields with
 * embedded commas/newlines and a leading UTF-8 BOM. Blank lines are skipped.
 * Cells are returned verbatim (not trimmed) so multi-line search strings are
 * preserved — callers trim where appropriate. */
export function parseCsvRows(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  return (result.data ?? []).filter((row) => Array.isArray(row));
}

/** Serialize a header + rows to CSV text (LF newlines). A UTF-8 BOM is
 * prepended so Excel opens the file as UTF-8, matching the source exports. */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const body = Papa.unparse(
    {
      fields: headers,
      data: rows.map((r) => r.map((c) => (c == null ? "" : c))),
    },
    { newline: "\n" },
  );
  return `${BOM}${body}`;
}
