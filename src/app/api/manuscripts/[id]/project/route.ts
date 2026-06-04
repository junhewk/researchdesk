import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getManuscript,
  linkProjectFolder,
  unlinkProjectFolder,
  setPrimaryFile,
  syncPrimaryFileToContentMd,
  listProjectFiles,
  validateProjectRoot,
  autoProvisionProjectFolder,
  importProjectMarkdownFile,
  normalizeProjectProtectionMode,
} from "@/server/manuscripts";

const patchSchema = z.object({
  project_root: z.string().optional(),
  primary_file: z.string().optional(),
  import_file: z.object({
    filename: z.string().min(1),
    content_md: z.string().min(1),
  }).optional(),
  unlink: z.boolean().optional(),
  sync: z.boolean().optional(),
  auto_provision: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = getManuscript(id);
  if (!m) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  const normalized = normalizeProjectProtectionMode(id) ?? m;
  const files = normalized.project_root ? listProjectFiles(id) : [];
  return NextResponse.json({
    project_root: normalized.project_root,
    primary_file: normalized.primary_file,
    is_git: normalized.is_git,
    files,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = getManuscript(id);
  if (!m) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = z
    .object({ path: z.string().min(1).optional() })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!parsed.data.path) {
    return NextResponse.json(
      validateProjectRoot(""),
      { status: 400 },
    );
  }
  const validation = validateProjectRoot(parsed.data.path);
  return NextResponse.json(validation);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = getManuscript(id);
  if (!m) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    if (data.unlink) {
      const updated = unlinkProjectFolder(id);
      return NextResponse.json(updated);
    }
    if (data.auto_provision) {
      const updated = autoProvisionProjectFolder(id);
      return NextResponse.json(updated);
    }
    if (data.import_file) {
      const file = importProjectMarkdownFile(id, data.import_file);
      const updated = normalizeProjectProtectionMode(id) ?? getManuscript(id);
      return NextResponse.json({ manuscript: updated, imported_file: file });
    }
    if (data.project_root) {
      const updated = linkProjectFolder(id, data.project_root, data.primary_file);
      return NextResponse.json(updated);
    }
    if (data.primary_file) {
      const updated = setPrimaryFile(id, data.primary_file);
      return NextResponse.json(updated);
    }
    if (data.sync) {
      syncPrimaryFileToContentMd(id);
      const updated = getManuscript(id);
      return NextResponse.json(updated);
    }
    return NextResponse.json(m);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "operation failed" },
      { status: 400 },
    );
  }
}
