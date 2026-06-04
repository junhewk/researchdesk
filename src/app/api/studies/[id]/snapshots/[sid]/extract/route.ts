import { NextRequest, NextResponse } from "next/server";
import { getStudy, getSnapshot } from "@/server/studies";
import {
  extractFromSnapshot,
  snapshotHasDigest,
} from "@/server/methods/evidence";
import { getStudySupervisor } from "@/server/methods/studySessions";
import type { Provider } from "@/server/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { id, sid } = await params;
  const study = getStudy(id);
  const snapshot = getSnapshot(sid);
  if (!study || !snapshot || snapshot.study_id !== id) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  // Deterministic path: a structured digest needs no LLM.
  if (snapshotHasDigest(snapshot.raw_json)) {
    const items = extractFromSnapshot(snapshot);
    return NextResponse.json({ mode: "deterministic", extracted: items.length });
  }

  // Free-form report: hand to the agent extraction pass.
  const provider: Provider = "openai";
  const sup = getStudySupervisor();
  try {
    const session = sup.createSession({
      studyId: id,
      pass: "evidence_extraction",
      provider,
    });
    const apiBaseUrl = process.env.REVIEWER_API_URL || request.nextUrl.origin;
    await sup.startPass(session.id, { apiBaseUrl, snapshotId: sid });
    return NextResponse.json({ mode: "agent", session_id: session.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start extraction" },
      { status: 400 },
    );
  }
}
