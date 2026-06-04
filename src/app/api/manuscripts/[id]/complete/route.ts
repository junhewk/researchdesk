import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { nowUnix } from "@/lib/utils";
import { touchManuscript } from "@/server/manuscripts";

/**
 * Mark a manuscript as completed. User-confirmed flip — the agent never
 * sets status to 'completed' on its own; this endpoint is the human gate.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM manuscripts WHERE id = ?")
    .get(id);
  if (!exists) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  db.prepare(
    "UPDATE manuscripts SET status = 'completed', updated_at = ? WHERE id = ?",
  ).run(nowUnix(), id);
  touchManuscript(id);
  return NextResponse.json({ id, status: "completed" });
}
