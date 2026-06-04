import { NextRequest, NextResponse } from "next/server";
import { getSupervisor } from "@/server/supervisor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supervisor = getSupervisor();
  await supervisor.interruptSession(id);

  return NextResponse.json({ ok: true });
}
