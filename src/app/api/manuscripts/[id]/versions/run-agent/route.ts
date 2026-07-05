import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateManuscriptSession } from "@/server/sessionQueries";
import { getSupervisor } from "@/server/supervisor";
import { getManuscript } from "@/server/manuscripts";
import {
  apiProviderSchema,
  providerFieldWasProvided,
  resolveManuscriptProvider,
} from "@/server/apiAgent/providers";

const VERSION_PROMPT = `/version

Integrate pending accepted suggestions into a new manuscript version. Do not open an interactive user conversation; if a judgment call is required, leave that passage unchanged and note the unresolved issue in the version summary.`;

const postSchema = z.object({
  provider: apiProviderSchema.default("openai"),
  model: z.string().trim().optional().nullable(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let session;
  try {
    session = await getOrCreateManuscriptSession(id, {
      provider: resolveManuscriptProvider(
        parsed.data.provider,
        providerFieldWasProvided(body),
        manuscript.confidentiality_mode === "local_only",
      ),
      model: parsed.data.model?.trim() || null,
      effort: parsed.data.effort ?? null,
      mode: "version",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not open session" },
      { status: 500 },
    );
  }

  const apiBaseUrl = request.nextUrl.origin;
  void getSupervisor()
    .sendMessage(session.id, VERSION_PROMPT, { apiBaseUrl })
    .catch(() => {
      /* status is available from the internal session record */
    });

  return NextResponse.json({ session_id: session.id });
}
