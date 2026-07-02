import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getStudy,
  listProposalOptions,
  createProposalOption,
} from "@/server/studies";
import { getCardDef } from "@/server/methods/cardSchema";
import { sanitizeProposalFields } from "@/server/methods/proposals";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(listProposalOptions(id, type));
}

const optionSchema = z.object({
  label: z.string().min(1),
  value_suggestion: z.string().optional(),
  fields_suggestion: z.record(z.string(), z.string()).optional(),
  consequence_md: z.string().optional(),
  session_id: z.string().optional(),
});

// Posted by the card_proposal agent pass (curl callback), one row per option.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const def = getCardDef(study.mode, type);
  const parsed = optionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const option = createProposalOption({
    study_id: id,
    card_type: type,
    session_id: parsed.data.session_id ?? null,
    label: parsed.data.label,
    value_suggestion: parsed.data.value_suggestion,
    fields_suggestion: sanitizeProposalFields(
      parsed.data.fields_suggestion,
      (def?.requiredFields ?? []).map((field) => field.id),
    ),
    consequence_md: parsed.data.consequence_md,
  });
  return NextResponse.json(option, { status: 201 });
}
