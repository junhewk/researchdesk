import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getManuscript } from "@/server/manuscripts";
import {
  createResponse,
  listReviewerResponses,
  seedFromLetters,
} from "@/server/reviewerResponses";
import { getSupervisor } from "@/server/supervisor";
import { apiProviderSchema } from "@/server/apiAgent/providers";

const postSchema = z.object({
  round: z.number().int().positive().default(1),
  provider: apiProviderSchema.default("openai"),
  model: z.string().optional().nullable(),
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

  let session_id: string | null = null;
  if (!parsed.data.skip_agent) {
    try {
      const session = await getSupervisor().createSession({
        manuscriptId: id,
        workflow: "methods",
        provider: parsed.data.provider,
        model: parsed.data.model ?? null,
        effort: parsed.data.effort ?? null,
        mode: "reviewer_response",
      });
      session_id = session.id;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "could not start session" },
        { status: 400 },
      );
    }
  }

  const response = createResponse({
    manuscriptId: id,
    round: parsed.data.round,
    sessionId: session_id,
  });
  const seeded = seedFromLetters(response.id);

  return NextResponse.json(
    { ...response, session_id, seeded_items: seeded.seeded },
    { status: 201 },
  );
}
