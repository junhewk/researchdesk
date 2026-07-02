import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@/lib/dataDir";

const IGNORE_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".venv",
  "__pycache__",
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function dataDir(): string {
  return resolveDataDir();
}

export function snapshotDirFor(sessionId: string): string {
  return path.join(dataDir(), "snapshots", sessionId);
}

function copyTree(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;
    const srcPath = path.join(/* turbopackIgnore: true */ src, entry.name);
    const dstPath = path.join(/* turbopackIgnore: true */ dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(srcPath, dstPath);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(srcPath);
        if (stat.size > MAX_FILE_BYTES) continue;
        fs.copyFileSync(srcPath, dstPath);
      } catch {
        // ignore unreadable files
      }
    }
  }
}

export function snapshotProjectFolder(
  sessionId: string,
  projectRoot: string,
): string {
  const dst = snapshotDirFor(sessionId);
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  copyTree(projectRoot, dst);
  return dst;
}

export function diffAgainstSnapshot(
  sessionId: string,
  projectRoot: string,
): { changed: string[]; created: string[]; deleted: string[] } {
  const snap = snapshotDirFor(sessionId);
  if (!fs.existsSync(snap)) {
    return { changed: [], created: [], deleted: [] };
  }
  const collect = (root: string, rel: string, out: Map<string, string>) => {
    const dir = path.join(/* turbopackIgnore: true */ root, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? path.join(/* turbopackIgnore: true */ rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        collect(root, childRel, out);
      } else if (entry.isFile()) {
        try {
          out.set(
            childRel,
            fs.readFileSync(
              path.join(/* turbopackIgnore: true */ root, childRel),
              "utf-8",
            ),
          );
        } catch {
          // ignore
        }
      }
    }
  };
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  collect(snap, "", before);
  collect(projectRoot, "", after);

  const changed: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];
  for (const [rel, text] of after) {
    if (!before.has(rel)) created.push(rel);
    else if (before.get(rel) !== text) changed.push(rel);
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) deleted.push(rel);
  }
  return { changed, created, deleted };
}

export function revertFromSnapshot(
  sessionId: string,
  projectRoot: string,
  relativePath: string,
): boolean {
  const snap = snapshotDirFor(sessionId);
  const src = path.join(snap, relativePath);
  const dst = path.join(projectRoot, relativePath);
  if (!fs.existsSync(src)) {
    // Source missing: file was created during the session — delete it from project.
    if (fs.existsSync(dst)) {
      fs.rmSync(dst);
      return true;
    }
    return false;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}
