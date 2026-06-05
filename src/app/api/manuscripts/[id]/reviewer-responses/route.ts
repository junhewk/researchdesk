import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getManuscript } from "@/server/manuscripts";
import {
  createResponse,
  listReviewerResponses,
  seedFromLetters,
} from "@/server/reviewerResponses";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  resolveApiProvider,
} from "@/server/apiAgent/providers";
import { runReviewerResponseAgent } from "@/server/apiAgent/workflows";

const postSchema = apiAgentRequestSchema.extend({
  round: z.number().int().positive().default(1),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
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
  return NextResponse.json(listReviewerResponses(id));
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

  const response = createResponse({
    manuscriptId: id,
    round: parsed.data.round,
    sessionId: null,
  });
  const seeded = seedFromLetters(response.id);

  if (parsed.data.skip_agent) {
    return NextResponse.json(
      { ...response, session_id: null, seeded_items: seeded.seeded, agent_items: 0 },
      { status: 201 },
    );
  }

  try {
    const agent = await runReviewerResponseAgent({
      responseId: response.id,
      config: {
        provider: resolveApiProvider(
          parsed.data.provider,
          providerFieldWasProvided(body),
        ),
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
      },
    });

    return NextResponse.json(
      {
        ...response,
        session_id: null,
        seeded_items: seeded.seeded,
        agent_items: agent.updated,
        summary_md: agent.summary_md,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "reviewer-response agent failed",
        response_id: response.id,
        seeded_items: seeded.seeded,
      },
      { status: 400 },
    );
  }
}
