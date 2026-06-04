import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudy, createSnapshot, listSnapshots } from "@/server/studies";
import { extractFromSnapshot, snapshotHasDigest } from "@/server/methods/evidence";

const importSchema = z.object({
  source: z.enum(["mdr", "rw"]),
  label: z.string().optional(),
  // The verbatim payload — an object (preferred) or a pre-serialized string.
  data: z.union([z.record(z.string(), z.unknown()), z.string()]),
  report_md: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(listSnapshots(id));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const raw_json =
    typeof parsed.data.data === "string"
      ? parsed.data.data
      : JSON.stringify(parsed.data.data);

  const snapshot = createSnapshot({
    study_id: id,
    source: parsed.data.source,
    label: parsed.data.label,
    raw_json,
    report_md: parsed.data.report_md,
  });

  // Auto-extract deterministically when the payload carries a digest.
  const extracted = snapshotHasDigest(raw_json)
    ? extractFromSnapshot(snapshot).length
    : 0;

  return NextResponse.json(
    { snapshot, extracted, has_digest: snapshotHasDigest(raw_json) },
    { status: 201 },
  );
}
