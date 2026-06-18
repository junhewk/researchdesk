import fs from "fs";
import path from "path";
import type { Manuscript, Commentary, Revision, Review } from "./types";
import { getDb } from "./db";

// Reuse db.ts path resolution by getting the db path and deriving data dir
function getDataDir(): string {
  const db = getDb();
  const dbPath = db.pragma("database_list") as Array<{ file: string }>;
  if (dbPath[0]?.file) {
    return path.dirname(dbPath[0].file);
  }
  return path.resolve(
    process.env.REVIEWER_DATA_DIR ||
      path.join(/* turbopackIgnore: true */ process.cwd(), "data"),
  );
}

let _dataDir: string | null = null;
function dataDir(): string {
  if (!_dataDir) _dataDir = getDataDir();
  return _dataDir;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function manuscriptDir(manuscriptId: string): string {
  return path.resolve(dataDir(), "exports", "manuscripts", manuscriptId);
}

export function deleteManuscriptExport(manuscriptId: string): void {
  const dir = manuscriptDir(manuscriptId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function exportManuscript(m: Manuscript): void {
  // Skip the legacy export when the manuscript is folder-linked: the canonical
  // file lives on disk in m.project_root and writing original.md would create a
  // stale shadow.
  if (m.project_root) return;

  const dir = manuscriptDir(m.id);
  ensureDir(dir);

  const frontmatter = [
    "---",
    `title: "${m.title.replace(/"/g, '\\"')}"`,
    `status: ${m.status}`,
    m.journal_type ? `journal_type: ${m.journal_type}` : null,
    m.research_domain ? `research_domain: ${m.research_domain}` : null,
    m.research_type ? `research_type: ${m.research_type}` : null,
    `created_at: ${new Date(m.created_at).toISOString()}`,
    `updated_at: ${new Date(m.updated_at).toISOString()}`,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  void fs.promises.writeFile(path.join(dir, "original.md"), frontmatter + m.content_md, "utf-8");
}

export function exportCommentary(c: Commentary): void {
  const dir = path.join(manuscriptDir(c.manuscript_id), "commentaries");
  ensureDir(dir);

  const frontmatter = [
    "---",
    c.reviewer_label ? `reviewer: "${c.reviewer_label}"` : null,
    `round: ${c.round}`,
    c.source ? `source: ${c.source}` : null,
    `created_at: ${new Date(c.created_at).toISOString()}`,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  void fs.promises.writeFile(path.join(dir, `${c.id}.md`), frontmatter + c.content_md, "utf-8");
}

export function exportRevision(r: Revision): void {
  const dir = path.join(manuscriptDir(r.manuscript_id), "revisions");
  ensureDir(dir);

  const frontmatter = [
    "---",
    `category: ${r.category}`,
    `status: ${r.status}`,
    `round: ${r.round}`,
    r.commentary_id ? `commentary_id: ${r.commentary_id}` : null,
    `created_at: ${new Date(r.created_at).toISOString()}`,
    r.applied_at ? `applied_at: ${new Date(r.applied_at).toISOString()}` : null,
    "---",
    "",
    "## Suggestion",
    "",
    r.suggestion_md,
  ]
    .filter(Boolean)
    .join("\n");

  let content = frontmatter;

  if (r.revised_md) {
    content += "\n\n## Revised Text\n\n" + r.revised_md;
  }
  if (r.user_revision) {
    content += "\n\n## User Revision\n\n" + r.user_revision;
  }

  void fs.promises.writeFile(path.join(dir, `${r.id}.md`), content, "utf-8");
}

export function exportRevisionHarness(
  manuscriptId: string,
  files: { agentsMd: string; harnessMd: string },
): void {
  const dir = manuscriptDir(manuscriptId);
  ensureDir(dir);
  void fs.promises.writeFile(path.join(dir, "AGENTS.md"), files.agentsMd, "utf-8");
  void fs.promises.writeFile(
    path.join(dir, "revision-harness.md"),
    files.harnessMd,
    "utf-8",
  );
}

export function exportReview(r: Review): void {
  const dir = path.join(manuscriptDir(r.manuscript_id), "reviews");
  ensureDir(dir);

  const frontmatter = [
    "---",
    `category: ${r.category}`,
    r.severity ? `severity: ${r.severity}` : null,
    r.section_ref ? `section_ref: "${r.section_ref}"` : null,
    `status: ${r.status}`,
    `created_at: ${new Date(r.created_at).toISOString()}`,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  void fs.promises.writeFile(path.join(dir, `${r.id}.md`), frontmatter + r.content_md, "utf-8");
}
