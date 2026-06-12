import { NextRequest, NextResponse } from "next/server";
import { getStudy, getSnapshot } from "@/server/studies";
import {
  extractFromSnapshot,
  snapshotHasDigest,
} from "@/server/methods/evidence";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  requireLocalApiProvider,
  resolveApiProvider,
} from "@/server/apiAgent/providers";
import { runEvidenceExtractionAgent } from "@/server/apiAgent/workflows";
import { classifyAgentError } from "@/server/providerHealth";

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

  const body = await request.json().catch(() => ({}));
  const parsed = apiAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let provider = resolveApiProvider(
    parsed.data.provider,
    providerFieldWasProvided(body),
  );
  if (study.confidentiality_mode === "local_only") {
    const local = requireLocalApiProvider(
      parsed.data.provider,
      providerFieldWasProvided(body),
    );
    if (local.error || !local.provider) {
      return NextResponse.json({ error: local.error }, { status: 400 });
    }
    provider = local.provider;
  }

  // Free-form notes / report: synchronous structured extraction pass.
  try {
    const result = await runEvidenceExtractionAgent({
      snapshotId: sid,
      config: {
        provider,
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
      },
    });
    return NextResponse.json({
      mode: "agent",
      extracted: result.created,
      summary_md: result.summary_md,
    });
  } catch (err) {
    const classified = classifyAgentError(err, provider);
    return NextResponse.json(
      { error: classified.message, error_code: classified.code, fix: classified.fix },
      { status: 400 },
    );
  }
}
