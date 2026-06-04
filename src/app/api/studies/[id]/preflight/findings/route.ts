import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudy, createFinding } from "@/server/studies";

const findingSchema = z.object({
  layer: z.enum(["completeness", "consistency", "risk"]).default("risk"),
  severity: z.enum(["blocking", "important", "minor"]),
  card_type: z.string().nullable().optional(),
  title: z.string().min(1),
  detail_md: z.string().optional(),
  session_id: z.string().optional(),
});

// Used by the agent risk pass (curl callback).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const parsed = findingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const finding = createFinding({
    study_id: id,
    session_id: parsed.data.session_id ?? null,
    layer: parsed.data.layer,
    severity: parsed.data.severity,
    card_type: parsed.data.card_type ?? null,
    title: parsed.data.title,
    detail_md: parsed.data.detail_md,
  });
  return NextResponse.json(finding, { status: 201 });
}
