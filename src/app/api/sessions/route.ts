import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupervisor } from "@/server/supervisor";
import { apiProviderSchema } from "@/server/apiAgent/providers";

const createSchema = z.object({
  manuscript_id: z.string().min(1),
  workflow: z.enum(["revision", "review", "manuscript"]),
  provider: apiProviderSchema,
  model: z.string().trim().optional().nullable(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
  mode: z.string().trim().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supervisor = getSupervisor();
  const session = await supervisor.createSession({
    manuscriptId: parsed.data.manuscript_id,
    workflow: parsed.data.workflow,
    provider: parsed.data.provider,
    model: parsed.data.model?.trim() || null,
    effort: parsed.data.effort ?? null,
    mode: parsed.data.mode?.trim() || null,
  });

  return NextResponse.json(session, { status: 201 });
}
