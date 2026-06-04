import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getOrCreateManuscriptSession } from "@/server/sessionQueries";
import { getSupervisor } from "@/server/supervisor";

const FINALIZE_PROMPT = `/finalize

Run the final-submission pass for this revision round. Inspect every editor/reviewer point, write \`response_to_reviewers_final.md\` and \`revision_table_final.md\` in the project folder, and end with either READY_TO_FINALIZE or GAPS_REMAIN per the system prompt.`;

/**
 * Kick off the agent's finalize pass for a manuscript.
 *
 * Single click from the lifecycle Finalize button: get-or-create the
 * continuing manuscript session, send a /finalize message, and return
 * the session id so the caller can redirect into the workspace to watch.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const exists = getDb()
    .prepare("SELECT id FROM manuscripts WHERE id = ?")
    .get(id);
  if (!exists) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }

  let session;
  try {
    session = await getOrCreateManuscriptSession(id, {
      provider: "openai",
      mode: "finalize",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not open session" },
      { status: 500 },
    );
  }

  // Dispatch the /finalize message in the background; the supervisor will
  // boot the agent process if it isn't running. The caller redirects to
  // the workspace before the agent has actually finished — that's by design.
  const apiBaseUrl = request.nextUrl.origin;
  void getSupervisor()
    .sendMessage(session.id, FINALIZE_PROMPT, { apiBaseUrl })
    .catch(() => {
      // Errors flow back through the supervisor's event stream; nothing
      // to do here. The workspace SessionStream surfaces them.
    });

  return NextResponse.json({ session_id: session.id });
}
