import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getStudy,
  listDecisions,
  getOrCreateArtifact,
  updateArtifact,
} from "@/server/studies";
import {
  compileArtifact,
  ALL_ARTIFACT_KINDS,
} from "@/server/methods/artifacts";
import { exportStudyArtifact } from "@/server/methods/studyExport";
import type { StudyArtifactKind } from "@/server/types";

function isKind(k: string): k is StudyArtifactKind {
  return (ALL_ARTIFACT_KINDS as string[]).includes(k);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await params;
  const study = getStudy(id);
  if (!study || !isKind(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const compiled = compileArtifact(study, listDecisions(id), kind);
  const stored = getOrCreateArtifact(id, kind);
  return NextResponse.json({ compiled, override_md: stored.override_md });
}

const patchSchema = z.object({ override_md: z.string().nullable() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await params;
  const study = getStudy(id);
  if (!study || !isKind(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const decisions = listDecisions(id);
  const compiled = compileArtifact(study, decisions, kind);
  const updated = updateArtifact(id, kind, {
    override_md: parsed.data.override_md,
    compiled_json: JSON.stringify(compiled),
    ready_pct: compiled.ready_pct,
  });
  exportStudyArtifact(id, compiled, parsed.data.override_md);
  return NextResponse.json(updated);
}
