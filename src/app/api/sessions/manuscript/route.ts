import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateManuscriptSession } from "@/server/sessionQueries";
import { getManuscript } from "@/server/manuscripts";
import {
  apiProviderSchema,
  providerFieldWasProvided,
  resolveManuscriptProvider,
} from "@/server/apiAgent/providers";

const postSchema = z.object({
  manuscript_id: z.string().min(1),
  provider: apiProviderSchema.default("openai"),
  model: z.string().trim().optional().nullable(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
  mode: z.string().trim().optional().nullable(),
});

/**
 * Get-or-create the continuing manuscript-agent session.
 * One thread per manuscript: returns the existing live thread if there is
 * one, otherwise creates a fresh one with the supplied defaults.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const manuscript = getManuscript(parsed.data.manuscript_id);
  if (!manuscript) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }

  try {
    const session = await getOrCreateManuscriptSession(parsed.data.manuscript_id, {
      provider: resolveManuscriptProvider(
        parsed.data.provider,
        providerFieldWasProvided(body),
        manuscript.confidentiality_mode === "local_only",
      ),
      model: parsed.data.model?.trim() || null,
      effort: parsed.data.effort ?? null,
      mode: (parsed.data.mode?.trim() || null) as never,
    });

    return NextResponse.json(session, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open session" },
      { status: 400 },
    );
  }
}
