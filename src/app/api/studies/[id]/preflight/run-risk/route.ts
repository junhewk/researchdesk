import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  requireLocalApiProvider,
  resolveApiProvider,
} from "@/server/apiAgent/providers";
import { runPreflightRiskAgent } from "@/server/apiAgent/workflows";
import { classifyAgentError } from "@/server/providerHealth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
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
  try {
    const result = await runPreflightRiskAgent({
      studyId: id,
      config: {
        provider,
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const classified = classifyAgentError(err, provider);
    return NextResponse.json(
      { error: classified.message, error_code: classified.code, fix: classified.fix },
      { status: 400 },
    );
  }
}
