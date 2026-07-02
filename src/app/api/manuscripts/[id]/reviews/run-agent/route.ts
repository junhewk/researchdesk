import { NextRequest, NextResponse } from "next/server";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  resolveManuscriptProvider,
} from "@/server/apiAgent/providers";
import { runReviewAgent } from "@/server/apiAgent/workflows";
import { getManuscript } from "@/server/manuscripts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = apiAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runReviewAgent({
      manuscriptId: id,
      config: {
        provider: resolveManuscriptProvider(
          parsed.data.provider,
          providerFieldWasProvided(body),
          manuscript.confidentiality_mode === "local_only",
        ),
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
        ensembleCount: parsed.data.ensemble_count,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "review agent failed" },
      { status: 400 },
    );
  }
}
