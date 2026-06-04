import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  getManuscript,
  normalizeProjectProtectionMode,
  syncPrimaryFileToContentMd,
} from "@/server/manuscripts";
import { diffAgainstSnapshot, revertFromSnapshot } from "@/server/projectSnapshot";

const revertSchema = z.object({
  session_id: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
});

function gitDiffStat(root: string): Array<{ path: string; insertions: number; deletions: number }> {
  const r = spawnSync("git", ["diff", "--relative", "HEAD", "--numstat", "--", "."], {
    cwd: root,
    encoding: "utf-8",
  });
  if (r.status !== 0) return [];
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ins, del, ...rest] = line.split("\t");
      return {
        path: rest.join("\t"),
        insertions: Number(ins) || 0,
        deletions: Number(del) || 0,
      };
    });
}

function gitDiffFile(root: string, file: string): string {
  const r = spawnSync("git", ["diff", "--relative", "HEAD", "--", file], {
    cwd: root,
    encoding: "utf-8",
  });
  return r.status === 0 ? r.stdout : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = normalizeProjectProtectionMode(id) ?? getManuscript(id);
  if (!m?.project_root) {
    return NextResponse.json(
      { error: "Manuscript is not folder-linked" },
      { status: 400 },
    );
  }
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? undefined;
  const file = request.nextUrl.searchParams.get("file");

  if (m.is_git) {
    if (file) {
      return NextResponse.json({
        is_git: true,
        file,
        diff: gitDiffFile(m.project_root, file),
      });
    }
    return NextResponse.json({
      is_git: true,
      stats: gitDiffStat(m.project_root),
    });
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: "session_id required for snapshot diff" },
      { status: 400 },
    );
  }
  const snapDiff = diffAgainstSnapshot(sessionId, m.project_root);
  if (file) {
    const live = fs.existsSync(path.join(m.project_root, file))
      ? fs.readFileSync(path.join(m.project_root, file), "utf-8")
      : "";
    return NextResponse.json({
      is_git: false,
      file,
      live,
    });
  }
  return NextResponse.json({
    is_git: false,
    ...snapDiff,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = normalizeProjectProtectionMode(id) ?? getManuscript(id);
  if (!m?.project_root) {
    return NextResponse.json(
      { error: "Manuscript is not folder-linked" },
      { status: 400 },
    );
  }
  const body = await request.json();
  const parsed = revertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const reverted: string[] = [];
  if (m.is_git) {
    for (const file of parsed.data.files) {
      const r = spawnSync("git", ["checkout", "--", file], {
        cwd: m.project_root,
        encoding: "utf-8",
      });
      if (r.status === 0) reverted.push(file);
    }
  } else {
    for (const file of parsed.data.files) {
      if (revertFromSnapshot(parsed.data.session_id, m.project_root, file)) {
        reverted.push(file);
      }
    }
  }
  syncPrimaryFileToContentMd(id);
  return NextResponse.json({ reverted });
}
