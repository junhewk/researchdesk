import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appendReadinessItem,
  getReadinessCheck,
  listReadinessItems,
} from "@/server/readinessChecks";

const postSchema = z.object({
  gate: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]).optional().nullable(),
  finding_md: z.string().min(1),
  suggested_fix_md: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }
  return NextResponse.json(listReadinessItems(id));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReadinessCheck(id)) {
    return NextResponse.json({ error: "check not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = appendReadinessItem({
    checkId: id,
    gate: parsed.data.gate,
    severity: parsed.data.severity ?? null,
    finding_md: parsed.data.finding_md,
    suggested_fix_md: parsed.data.suggested_fix_md ?? null,
  });
  return NextResponse.json(item, { status: 201 });
}
