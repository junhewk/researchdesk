import { NextRequest, NextResponse } from "next/server";
import { getStudy, listDecisions, updateArtifact, getOrCreateArtifact } from "@/server/studies";
import {
  compileArtifact,
  ALL_ARTIFACT_KINDS,
} from "@/server/methods/artifacts";

// Compiles every artifact from the current cards, persists its ready_pct +
// compiled snapshot, and returns a summary list for the artifact bar.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const decisions = listDecisions(id);
  const summaries = ALL_ARTIFACT_KINDS.map((kind) => {
    const compiled = compileArtifact(study, decisions, kind);
    updateArtifact(id, kind, {
      compiled_json: JSON.stringify(compiled),
      ready_pct: compiled.ready_pct,
    });
    const stored = getOrCreateArtifact(id, kind);
    return {
      kind,
      title: compiled.title,
      ready_pct: compiled.ready_pct,
      section_count: compiled.sections.length,
      has_override: Boolean(stored.override_md && stored.override_md.trim()),
    };
  });
  return NextResponse.json(summaries);
}
