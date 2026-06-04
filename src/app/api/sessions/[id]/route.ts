import { NextRequest, NextResponse } from "next/server";
import { getSupervisor } from "@/server/supervisor";
import { listSessionMessages } from "@/server/persist";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supervisor = getSupervisor();
  const session = await supervisor.getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = listSessionMessages(id);

  return NextResponse.json({ ...session, messages });
}
