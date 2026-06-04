import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDecision, linkEvidence, unlinkEvidence } from "@/server/studies";
import { recomputeCardState } from "@/server/methods/cardService";

const bodySchema = z.object({
  evidence_item_id: z.string().min(1),
  note: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const decision = getDecision(id, type);
  if (!decision) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  linkEvidence(decision.id, parsed.data.evidence_item_id, parsed.data.note);
  const updated = recomputeCardState(decision.id);
  return NextResponse.json(updated, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const decision = getDecision(id, type);
  if (!decision) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  unlinkEvidence(decision.id, parsed.data.evidence_item_id);
  const updated = recomputeCardState(decision.id);
  return NextResponse.json(updated);
}
