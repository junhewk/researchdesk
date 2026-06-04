import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteCommentary,
  getCommentary,
  updateCommentary,
} from "@/server/commentaries";

const patchSchema = z.object({
  content_md: z.string().optional(),
  reviewer_label: z.string().trim().optional().nullable(),
  round: z.number().int().positive().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await context.params;
  const c = getCommentary(cid);
  if (!c || c.manuscript_id !== id) {
    return NextResponse.json({ error: "commentary not found" }, { status: 404 });
  }
  return NextResponse.json(c);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await context.params;
  const c = getCommentary(cid);
  if (!c || c.manuscript_id !== id) {
    return NextResponse.json({ error: "commentary not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = updateCommentary(cid, parsed.data);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await context.params;
  const c = getCommentary(cid);
  if (!c || c.manuscript_id !== id) {
    return NextResponse.json({ error: "commentary not found" }, { status: 404 });
  }
  deleteCommentary(cid);
  return NextResponse.json({ id: cid, deleted: true });
}
