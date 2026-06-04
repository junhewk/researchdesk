import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateChecklistItem } from "@/server/reportingChecklists";

const patchSchema = z.object({
  status: z.enum(["unaddressed", "addressed", "partial", "na"]).optional(),
  evidence_md: z.string().optional().nullable(),
  location_ref: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> },
) {
  const { iid } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = updateChecklistItem(iid, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
