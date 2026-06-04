import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAsset,
  getAsset,
  updateAsset,
} from "@/server/manuscriptAssets";
import type { ManuscriptAssetKind } from "@/server/types";

const ASSET_KINDS: readonly ManuscriptAssetKind[] = [
  "table",
  "appendix",
  "figure",
  "supplement",
  "response_letter",
  "other",
];

const patchSchema = z.object({
  kind: z
    .enum(ASSET_KINDS as unknown as [ManuscriptAssetKind, ...ManuscriptAssetKind[]])
    .optional(),
  label: z.string().trim().optional().nullable(),
  content_md: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; aid: string }> },
) {
  const { id, aid } = await context.params;
  const asset = getAsset(id, aid);
  if (!asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  return NextResponse.json(asset);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; aid: string }> },
) {
  const { id, aid } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = updateAsset(id, aid, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; aid: string }> },
) {
  const { id, aid } = await context.params;
  const ok = deleteAsset(id, aid);
  if (!ok) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  return NextResponse.json({ id: aid, deleted: true });
}
