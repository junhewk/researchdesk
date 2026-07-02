import { nanoid } from "nanoid";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { getDb, buildAssignments } from "./db";
import { nowUnix } from "@/lib/utils";
import { resolveDataDir } from "@/lib/dataDir";
import { exportManuscript, deleteManuscriptExport } from "./markdownExport";
import { insertInitialVersion } from "./manuscriptVersions";
import type { Manuscript, ManuscriptStatus, ProtocolConfidentialityMode } from "./types";

interface ManuscriptRow {
  id: string;
  study_id: string | null;
  title: string;
  content_md: string;
  original_content_md: string | null;
  original_file: string | null;
  file_format: string | null;
  journal_type: string | null;
  research_domain: string | null;
  research_type: string | null;
  review_request: string | null;
  project_root: string | null;
  primary_file: string | null;
  is_git: number;
  confidentiality_mode: ProtocolConfidentialityMode;
  status: ManuscriptStatus;
  created_at: number;
  updated_at: number;
}

function rowToManuscript(row: ManuscriptRow): Manuscript {
  return {
    ...row,
    is_git: Boolean(row.is_git),
  };
}

export function listManuscripts(opts?: {
  status?: ManuscriptStatus;
  domain?: string;
  studyId?: string;
  limit?: number;
  offset?: number;
}): Manuscript[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.domain) {
    clauses.push("research_domain = ?");
    params.push(opts.domain);
  }
  if (opts?.studyId) {
    clauses.push("study_id = ?");
    params.push(opts.studyId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(`SELECT * FROM manuscripts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as ManuscriptRow[];
  return rows.map(rowToManuscript);
}

/** Latest manuscript per study id, in one query (avoids an N+1 lookup when
 * resolving many studies' linked articles at once). */
export function listLatestManuscriptsByStudyIds(studyIds: string[]): Map<string, Manuscript> {
  const result = new Map<string, Manuscript>();
  if (studyIds.length === 0) return result;
  const db = getDb();
  const placeholders = studyIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM manuscripts WHERE study_id IN (${placeholders}) ORDER BY updated_at DESC`,
    )
    .all(...studyIds) as ManuscriptRow[];
  for (const row of rows) {
    if (row.study_id && !result.has(row.study_id)) {
      result.set(row.study_id, rowToManuscript(row));
    }
  }
  return result;
}

export function getManuscript(id: string): Manuscript | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM manuscripts WHERE id = ?").get(id) as ManuscriptRow | undefined;
  return row ? rowToManuscript(row) : undefined;
}

export function createManuscript(data: {
  study_id?: string | null;
  title: string;
  content_md: string;
  original_file?: string;
  file_format?: string;
  journal_type?: string;
  research_domain?: string;
  research_type?: string;
  review_request?: string;
  confidentiality_mode?: ProtocolConfidentialityMode;
}): Manuscript {
  const db = getDb();
  const now = nowUnix();
  const id = nanoid();

  const m: Manuscript = {
    id,
    study_id: data.study_id ?? null,
    title: data.title,
    content_md: data.content_md,
    original_content_md: data.content_md,
    original_file: data.original_file ?? null,
    file_format: data.file_format ?? null,
    journal_type: data.journal_type ?? null,
    research_domain: data.research_domain ?? null,
    research_type: data.research_type ?? null,
    review_request: data.review_request ?? null,
    project_root: null,
    primary_file: null,
    is_git: false,
    confidentiality_mode: data.confidentiality_mode ?? "cloud_default",
    status: "draft",
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO manuscripts
       (id, study_id, title, content_md, original_content_md, original_file,
        file_format, journal_type, research_domain, research_type,
        review_request, confidentiality_mode, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    m.id,
    m.study_id,
    m.title,
    m.content_md,
    m.original_content_md,
    m.original_file,
    m.file_format,
    m.journal_type,
    m.research_domain,
    m.research_type,
    m.review_request,
    m.confidentiality_mode,
    m.status,
    m.created_at,
    m.updated_at,
  );

  insertInitialVersion({
    manuscriptId: m.id,
    content_md: m.content_md,
    created_at: m.created_at,
  });

  exportManuscript(m);
  return m;
}

export function updateManuscript(
  id: string,
  data: Partial<Pick<Manuscript, "study_id" | "title" | "content_md" | "journal_type" | "research_domain" | "research_type" | "review_request" | "status">>,
): Manuscript | undefined {
  const db = getDb();
  const existing = getManuscript(id);
  if (!existing) return undefined;

  const { sets, params } = buildAssignments(data);

  if (sets.length === 0) return existing;

  sets.push("updated_at = ?");
  const now = nowUnix();
  params.push(now, id);

  db.prepare(`UPDATE manuscripts SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  const updated = getManuscript(id)!;
  if (!updated.project_root) {
    exportManuscript(updated);
  }
  return updated;
}

export function replaceUneditedGeneratedContent(
  id: string,
  content_md: string,
): Manuscript | undefined {
  const existing = getManuscript(id);
  if (!existing) return undefined;
  if (existing.content_md !== existing.original_content_md) return existing;

  const now = nowUnix();
  getDb()
    .prepare(
      `UPDATE manuscripts
          SET content_md = ?, original_content_md = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(content_md, content_md, now, id);

  if (existing.project_root && existing.primary_file) {
    const target = path.join(existing.project_root, existing.primary_file);
    fs.writeFileSync(target, content_md, "utf-8");
  }

  const updated = getManuscript(id)!;
  if (!updated.project_root) {
    exportManuscript(updated);
  }
  return updated;
}

export function deleteManuscript(id: string): boolean {
  const db = getDb();
  const existing = getManuscript(id);
  const result = db.prepare("DELETE FROM manuscripts WHERE id = ?").run(id);
  if (result.changes > 0) {
    deleteManuscriptExport(id);
    if (existing?.project_root) {
      const auto = autoProvisionedRoot(id);
      if (existing.project_root === auto && fs.existsSync(auto)) {
        fs.rmSync(auto, { recursive: true, force: true });
      }
    }
  }
  return result.changes > 0;
}

export function touchManuscript(manuscriptId: string): void {
  const db = getDb();
  db.prepare("UPDATE manuscripts SET updated_at = ? WHERE id = ?").run(nowUnix(), manuscriptId);
}

// ---------------------------------------------------------------------------
// Project folder linkage
// ---------------------------------------------------------------------------

function dataDir(): string {
  return resolveDataDir();
}

export function autoProvisionedRoot(manuscriptId: string): string {
  return path.join(dataDir(), "projects", manuscriptId);
}

function isAncestorOrEqual(candidate: string, target: string): boolean {
  const c = path.resolve(candidate);
  const t = path.resolve(target);
  if (c === t) return true;
  return t.startsWith(c.endsWith(path.sep) ? c : c + path.sep);
}

const PROJECT_FILE_RE = /\.(md|markdown|png|jpe?g|gif|webp|svg|pdf|docx)$/i;
const MARKDOWN_FILE_RE = /\.(md|markdown)$/i;

function listFiles(root: string, test: (name: string) => boolean): string[] {
  const out: string[] = [];
  const queue: string[] = [""];
  while (queue.length) {
    const rel = queue.shift()!;
    const dir = path.join(/* turbopackIgnore: true */ root, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      const childRel = rel ? path.join(/* turbopackIgnore: true */ rel, name) : name;
      if (entry.isDirectory()) {
        queue.push(childRel);
      } else if (entry.isFile() && test(name)) {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}

function listMarkdownFiles(root: string): string[] {
  return listFiles(root, (name) => MARKDOWN_FILE_RE.test(name));
}

function listRelevantProjectFiles(root: string): string[] {
  return listFiles(root, (name) => PROJECT_FILE_RE.test(name));
}

export interface ProjectFileEntry {
  relative_path: string;
  size: number;
  modified_at: number;
}

export function listProjectFiles(manuscriptId: string): ProjectFileEntry[] {
  const m = getManuscript(manuscriptId);
  if (!m?.project_root) return [];
  const root = m.project_root;
  if (!fs.existsSync(root)) return [];
  const files = listRelevantProjectFiles(root);
  return files.map((rel) => {
    const full = path.join(root, rel);
    const stat = fs.statSync(full);
    return {
      relative_path: rel,
      size: stat.size,
      modified_at: Math.floor(stat.mtimeMs / 1000),
    };
  });
}

export interface ValidateProjectRootResult {
  ok: boolean;
  reason?: string;
  is_git?: boolean;
  markdown_files?: string[];
}

export function validateProjectRoot(absPath: string): ValidateProjectRootResult {
  if (!path.isAbsolute(absPath)) {
    return { ok: false, reason: "path must be absolute" };
  }
  const home = os.homedir();
  const forbidden = ["/", "/tmp", "/var", "/etc", home].map((p) => path.resolve(p));
  for (const f of forbidden) {
    if (path.resolve(absPath) === f) {
      return { ok: false, reason: `refusing to link ${f}` };
    }
  }
  if (!fs.existsSync(absPath)) {
    return { ok: false, reason: "path does not exist" };
  }
  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    return { ok: false, reason: "path is not a directory" };
  }
  // Reject ancestors of common user dirs
  const sensitive = [home];
  for (const s of sensitive) {
    if (s && isAncestorOrEqual(absPath, s) && path.resolve(absPath) !== s) {
      // it would be the home itself; the equality check above covers home.
      // ancestors of home are e.g. /home — equally too broad.
    }
  }
  const markdownFiles = listMarkdownFiles(absPath);
  if (markdownFiles.length === 0) {
    return { ok: false, reason: "no .md files in folder" };
  }
  const isGit = detectGitRepo(absPath);
  return { ok: true, is_git: isGit, markdown_files: markdownFiles };
}

export function detectGitRepo(absPath: string): boolean {
  try {
    const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: absPath,
      encoding: "utf-8",
    });
    return result.status === 0 && result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

export function isAutoProvisionedProjectRoot(
  manuscriptId: string,
  projectRoot: string,
): boolean {
  return path.resolve(projectRoot) === path.resolve(autoProvisionedRoot(manuscriptId));
}

export function shouldUseGitProtection(
  manuscriptId: string,
  projectRoot: string,
): boolean {
  return !isAutoProvisionedProjectRoot(manuscriptId, projectRoot) && detectGitRepo(projectRoot);
}

export function gitCleanTree(absPath: string): boolean {
  try {
    const result = spawnSync("git", ["status", "--porcelain", "--", "."], {
      cwd: absPath,
      encoding: "utf-8",
    });
    if (result.status !== 0) return false;
    return result.stdout.trim().length === 0;
  } catch {
    return false;
  }
}

export function normalizeProjectProtectionMode(
  manuscriptId: string,
): Manuscript | undefined {
  const m = getManuscript(manuscriptId);
  if (!m?.project_root) return m;
  const shouldBeGit = shouldUseGitProtection(manuscriptId, m.project_root);
  if (m.is_git === shouldBeGit) return m;
  const db = getDb();
  db.prepare(`UPDATE manuscripts SET is_git = ?, updated_at = ? WHERE id = ?`)
    .run(shouldBeGit ? 1 : 0, nowUnix(), manuscriptId);
  return getManuscript(manuscriptId);
}

export function gitHeadSha(absPath: string): string | null {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: absPath,
      encoding: "utf-8",
    });
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

export function linkProjectFolder(
  manuscriptId: string,
  absPath: string,
  primaryFile?: string,
): Manuscript {
  const validation = validateProjectRoot(absPath);
  if (!validation.ok) {
    throw new Error(validation.reason || "invalid project root");
  }
  const files = validation.markdown_files!;
  const chosen = primaryFile && files.includes(primaryFile)
    ? primaryFile
    : files.includes("manuscript.md")
      ? "manuscript.md"
      : files[0];
  const db = getDb();
  db.prepare(
    `UPDATE manuscripts SET project_root = ?, primary_file = ?, is_git = ?, updated_at = ? WHERE id = ?`,
	).run(
	  path.resolve(absPath),
	  chosen,
	  shouldUseGitProtection(manuscriptId, absPath) ? 1 : 0,
	  nowUnix(),
	  manuscriptId,
	);
  syncPrimaryFileToContentMd(manuscriptId);
  return getManuscript(manuscriptId)!;
}

export function unlinkProjectFolder(manuscriptId: string): Manuscript | undefined {
  const db = getDb();
  db.prepare(
    `UPDATE manuscripts SET project_root = NULL, primary_file = NULL, is_git = 0, updated_at = ? WHERE id = ?`,
  ).run(nowUnix(), manuscriptId);
  return getManuscript(manuscriptId);
}

export function setPrimaryFile(
  manuscriptId: string,
  primaryFile: string,
): Manuscript | undefined {
  const m = getManuscript(manuscriptId);
  if (!m?.project_root) return m;
  if (!MARKDOWN_FILE_RE.test(primaryFile)) {
    throw new Error("primary file must be Markdown");
  }
  const full = path.join(/* turbopackIgnore: true */ m.project_root, primaryFile);
  if (!fs.existsSync(full)) {
    throw new Error(`primary file not found: ${primaryFile}`);
  }
  const db = getDb();
  db.prepare(`UPDATE manuscripts SET primary_file = ?, updated_at = ? WHERE id = ?`)
    .run(primaryFile, nowUnix(), manuscriptId);
  syncPrimaryFileToContentMd(manuscriptId);
  return getManuscript(manuscriptId);
}

export function syncPrimaryFileToContentMd(manuscriptId: string): void {
  const m = getManuscript(manuscriptId);
  if (!m?.project_root || !m.primary_file) return;
  const full = path.join(/* turbopackIgnore: true */ m.project_root, m.primary_file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf-8");
  const db = getDb();
  db.prepare(`UPDATE manuscripts SET content_md = ?, updated_at = ? WHERE id = ?`)
    .run(text, nowUnix(), manuscriptId);
}

export function autoProvisionProjectFolder(
  manuscriptId: string,
): Manuscript {
  const m = getManuscript(manuscriptId);
  if (!m) throw new Error("manuscript not found");
  if (m.project_root) return m;
  const root = autoProvisionedRoot(manuscriptId);
  fs.mkdirSync(root, { recursive: true });
  const target = path.join(/* turbopackIgnore: true */ root, "manuscript.md");
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, m.content_md, "utf-8");
  }
  const db = getDb();
  db.prepare(
    `UPDATE manuscripts SET project_root = ?, primary_file = ?, is_git = ?, updated_at = ? WHERE id = ?`,
  ).run(root, "manuscript.md", 0, nowUnix(), manuscriptId);
  return getManuscript(manuscriptId)!;
}

function sanitizeProjectFilename(filename: string): string {
  const parsed = path.parse(filename);
  const base = (parsed.name || "reference")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "reference";
  return `${base}.md`;
}

function uniqueProjectPath(root: string, filename: string): string {
  const parsed = path.parse(filename);
  let candidate = filename;
  let suffix = 2;
  while (fs.existsSync(path.join(root, candidate))) {
    candidate = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }
  return candidate;
}

export function importProjectMarkdownFile(
  manuscriptId: string,
  data: { filename: string; content_md: string },
): ProjectFileEntry {
  let m = getManuscript(manuscriptId);
  if (!m) throw new Error("manuscript not found");
  if (!m.project_root) {
    m = autoProvisionProjectFolder(manuscriptId);
  }
  const root = m.project_root!;
  fs.mkdirSync(root, { recursive: true });
  const relativePath = uniqueProjectPath(root, sanitizeProjectFilename(data.filename));
  const full = path.join(root, relativePath);
  fs.writeFileSync(full, data.content_md, "utf-8");
  const stat = fs.statSync(full);
  touchManuscript(manuscriptId);
  return {
    relative_path: relativePath,
    size: stat.size,
    modified_at: Math.floor(stat.mtimeMs / 1000),
  };
}
