import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getOrCreateManuscriptSession } from "@/server/sessionQueries";
import { getSupervisor } from "@/server/supervisor";
import { getDefaultApiProvider } from "@/server/providerSettings";

const FINALIZE_PROMPT = `/finalize

Run the final-submission pass for this revision round. Inspect every editor/reviewer point, write \`response_to_reviewers_final.md\` and \`revision_table_final.md\` in the project folder, and end with either READY_TO_FINALIZE or GAPS_REMAIN per the system prompt.`;

/**
 * Kick off the agent's finalize pass for a manuscript.
 *
 * Single click from the lifecycle Finalize button: get-or-create the
 * continuing manuscript session, send the internal finalize instruction,
 * and return the session id for status tracking.
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
      provider: getDefaultApiProvider(),
      mode: "finalize",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not open session" },
      { status: 500 },
    );
  }

  // Dispatch in the background; the supervisor will boot the agent process
  // if it isn't running.
  const apiBaseUrl = request.nextUrl.origin;
  void getSupervisor()
    .sendMessage(session.id, FINALIZE_PROMPT, { apiBaseUrl })
    .catch(() => {
      // Status is available from the internal session record.
    });

  return NextResponse.json({ session_id: session.id });
}
