import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getManuscript } from "@/server/manuscripts";
import {
  createReadinessCheck,
  listReadinessChecks,
  runReadinessPreChecks,
  runProtocolCompareChecks,
} from "@/server/readinessChecks";
import { getStudy } from "@/server/studies";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  requireLocalApiProvider,
} from "@/server/apiAgent/providers";
import { runReadinessAgent } from "@/server/apiAgent/workflows";

const postSchema = apiAgentRequestSchema.extend({
  study_id: z.string().optional().nullable(),
  skip_agent: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getManuscript(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  return NextResponse.json(listReadinessChecks(id));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getManuscript(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const studyId = parsed.data.study_id && getStudy(parsed.data.study_id)
    ? parsed.data.study_id
    : null;
  const study = studyId ? getStudy(studyId) : null;

  const check = createReadinessCheck({
    manuscriptId: id,
    studyId,
    sessionId: null,
  });
  const preChecks = runReadinessPreChecks({
    checkId: check.id,
    manuscriptId: id,
  });
  let compareFindings = 0;
  if (studyId) {
    compareFindings = runProtocolCompareChecks({
      checkId: check.id,
      manuscriptId: id,
      studyId,
    }).detected;
  }

  if (parsed.data.skip_agent) {
    return NextResponse.json(
      {
        ...check,
        session_id: null,
        deterministic_findings: preChecks.detected + compareFindings,
        agent_findings: 0,
      },
      { status: 201 },
    );
  }

  let provider = parsed.data.provider;
  if (study?.confidentiality_mode === "local_only") {
    const local = requireLocalApiProvider(
      parsed.data.provider,
      providerFieldWasProvided(body),
    );
    if (local.error || !local.provider) {
      return NextResponse.json({ error: local.error }, { status: 400 });
    }
    provider = local.provider;
  }

  try {
    const agent = await runReadinessAgent({
      checkId: check.id,
      config: {
        provider,
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
      },
    });
    return NextResponse.json(
      {
        ...check,
        session_id: null,
        deterministic_findings: preChecks.detected + compareFindings,
        agent_findings: agent.created,
        verdict: agent.verdict,
        overall_score: agent.overall_score,
        summary_md: agent.summary_md,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "readiness agent failed" },
      { status: 400 },
    );
  }
}
