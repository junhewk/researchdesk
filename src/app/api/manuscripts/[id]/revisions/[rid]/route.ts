import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRevision, updateRevision } from "@/server/revisions";

const updateSchema = z.object({
  status: z.enum(["pending", "applied", "dismissed"]).optional(),
  category: z.enum(["mechanical", "rewrite"]).optional(),
  user_revision: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const { rid } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = getRevision(rid);
  if (!existing) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  const updated = updateRevision(rid, parsed.data);

  if (!updated) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
