import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getReadinessCheck,
  listReadinessItems,
  updateReadinessCheck,
} from "@/server/readinessChecks";

const patchSchema = z.object({
  status: z.enum(["running", "completed", "failed"]).optional(),
  overall_score: z.number().int().min(0).max(100).optional().nullable(),
  summary_md: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const check = getReadinessCheck(id);
  if (!check) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }
  return NextResponse.json({ ...check, items: listReadinessItems(id) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(updateReadinessCheck(id, parsed.data));
}
