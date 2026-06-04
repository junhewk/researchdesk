import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudy, getSnapshot, createEvidenceItem } from "@/server/studies";

const itemSchema = z.object({
  snapshot_id: z.string().min(1),
  kind: z.enum([
    "prior_design",
    "population",
    "outcome",
    "confounder",
    "bias",
    "measure",
    "other",
  ]),
  label: z.string().min(1),
  detail_md: z.string().optional(),
  source_ref_json: z.string().optional(),
});

// Used by the agent extraction pass (curl callback) and by manual tray adds.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const parsed = itemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const snapshot = getSnapshot(parsed.data.snapshot_id);
  if (!snapshot || snapshot.study_id !== id) {
    return NextResponse.json({ error: "Snapshot not found for study" }, { status: 404 });
  }
  const item = createEvidenceItem({
    snapshot_id: parsed.data.snapshot_id,
    study_id: id,
    kind: parsed.data.kind,
    label: parsed.data.label,
    detail_md: parsed.data.detail_md,
    source_ref_json: parsed.data.source_ref_json,
  });
  return NextResponse.json(item, { status: 201 });
}
