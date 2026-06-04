import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setCard } from "@/server/methods/cardService";

const patchSchema = z.object({
  value: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  state: z
    .enum([
      "not_started",
      "drafted",
      "underspecified",
      "conflicting",
      "evidence_supported",
      "needs_input",
      "unknown",
      "assumed",
      "locked",
    ])
    .optional(),
  open_question_md: z.string().nullable().optional(),
  reason_md: z.string().nullable().optional(),
  rejected_alternatives_md: z.string().nullable().optional(),
  open_concern_md: z.string().nullable().optional(),
  evidence_ids: z.array(z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = setCard(id, type, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Study or card not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
