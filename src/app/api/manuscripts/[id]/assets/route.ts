import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { createAsset, listAssets } from "@/server/manuscriptAssets";
import type { ManuscriptAssetKind } from "@/server/types";

const ASSET_KINDS: readonly ManuscriptAssetKind[] = [
  "table",
  "appendix",
  "figure",
  "supplement",
  "response_letter",
  "other",
];

const postSchema = z.object({
  kind: z.enum(ASSET_KINDS as unknown as [ManuscriptAssetKind, ...ManuscriptAssetKind[]]),
  label: z.string().trim().optional().nullable(),
  original_file: z.string().min(1),
  file_format: z.string().trim().optional().nullable(),
  content_md: z.string().min(1),
  byte_size: z.number().int().nonnegative().optional().nullable(),
  version_number: z.number().int().positive().optional().nullable(),
});

function ensureManuscriptExists(id: string): boolean {
  return Boolean(
    getDb()
      .prepare("SELECT id FROM manuscripts WHERE id = ?")
      .get(id),
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ensureManuscriptExists(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  return NextResponse.json(listAssets(id));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ensureManuscriptExists(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = createAsset({
    manuscriptId: id,
    kind: parsed.data.kind,
    label: parsed.data.label ?? null,
    original_file: parsed.data.original_file,
    file_format: parsed.data.file_format ?? null,
    content_md: parsed.data.content_md,
    byte_size: parsed.data.byte_size ?? null,
    version_number: parsed.data.version_number ?? null,
  });
  return NextResponse.json(created, { status: 201 });
}
