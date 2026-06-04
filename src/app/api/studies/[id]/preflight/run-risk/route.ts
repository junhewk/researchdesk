import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import { apiAgentRequestSchema, isLocalApiProvider } from "@/server/apiAgent/providers";
import { runPreflightRiskAgent } from "@/server/apiAgent/workflows";

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
  const providerWasProvided =
    body && typeof body === "object" && typeof (body as { provider?: unknown }).provider === "string";
  const provider =
    study.confidentiality_mode === "local_only" && !providerWasProvided
      ? "llama_server"
      : parsed.data.provider;
  if (study.confidentiality_mode === "local_only" && !isLocalApiProvider(provider)) {
    return NextResponse.json(
      { error: "study is local_only; use ollama, lmstudio, or llama_server" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start risk pass" },
      { status: 400 },
    );
  }
}
