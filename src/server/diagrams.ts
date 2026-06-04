import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import type {
  DiagramKind,
  ManuscriptDiagram,
  ManuscriptKind,
} from "./types";

export interface CreateDiagramInput {
  manuscript_id: string;
  manuscript_kind: ManuscriptKind;
  kind: DiagramKind;
  title?: string | null;
  mermaid_src: string;
  notes_md?: string | null;
}

export function createDiagram(input: CreateDiagramInput): ManuscriptDiagram {
  const db = getDb();
  const id = nanoid();
  const created_at = nowUnix();

  const row: ManuscriptDiagram = {
    id,
    manuscript_id: input.manuscript_id,
    manuscript_kind: input.manuscript_kind,
    kind: input.kind,
    title: input.title ?? null,
    mermaid_src: input.mermaid_src,
    notes_md: input.notes_md ?? null,
    created_at,
  };

  db.prepare(
    `INSERT INTO manuscript_diagrams
       (id, manuscript_id, manuscript_kind, kind, title, mermaid_src, notes_md, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.manuscript_id,
    row.manuscript_kind,
    row.kind,
    row.title,
    row.mermaid_src,
    row.notes_md,
    row.created_at,
  );

  return row;
}

export function listDiagrams(
  manuscript_id: string,
  manuscript_kind: ManuscriptKind,
): ManuscriptDiagram[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM manuscript_diagrams
        WHERE manuscript_id = ? AND manuscript_kind = ?
        ORDER BY created_at ASC`,
    )
    .all(manuscript_id, manuscript_kind) as ManuscriptDiagram[];
}

export function getDiagram(id: string): ManuscriptDiagram | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM manuscript_diagrams WHERE id = ?")
    .get(id) as ManuscriptDiagram | undefined;
}

export function deleteDiagram(id: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM manuscript_diagrams WHERE id = ?").run(id).changes > 0;
}

const ALLOWED_DIAGRAM_PREFIXES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "journey",
  "timeline",
  "mindmap",
  "classDiagram",
  "erDiagram",
];

/**
 * Lightweight syntactic sanity-check on mermaid source: must declare a
 * recognized diagram type as the first non-empty, non-frontmatter line.
 * Real parsing happens client-side via the mermaid package; this only
 * rejects obvious garbage so the agent gets fast feedback.
 */
export function validateMermaidSource(src: string): { ok: true } | { ok: false; error: string } {
  const trimmed = src.trim();
  if (!trimmed) return { ok: false, error: "mermaid_src is empty" };

  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("%%") && !l.startsWith("---"));
  const first = lines[0] ?? "";
  for (const prefix of ALLOWED_DIAGRAM_PREFIXES) {
    if (first.startsWith(prefix)) return { ok: true };
  }
  return {
    ok: false,
    error: `mermaid_src must start with one of: ${ALLOWED_DIAGRAM_PREFIXES.join(", ")}`,
  };
}
