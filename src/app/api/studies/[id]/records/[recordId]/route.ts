import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRecord, patchRecord } from "@/server/methods/reviewCorpus";

const patchSchema = z.object({
  decision: z.enum(["include", "exclude", "maybe", "unscreened"]).optional(),
  decision_reason: z.string().nullable().optional(),
  user_confirmed: z.boolean().optional(),
  charting_json: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> },
) {
  const { id, recordId } = await params;
  const existing = getRecord(recordId);
  if (!existing || existing.study_id !== id) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = patchRecord(recordId, parsed.data);
  return NextResponse.json(updated);
}
