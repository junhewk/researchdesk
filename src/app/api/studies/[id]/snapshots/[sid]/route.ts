import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/server/studies";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { id, sid } = await params;
  const snapshot = getSnapshot(sid);
  if (!snapshot || snapshot.study_id !== id) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}
