import { NextRequest, NextResponse } from "next/server";
import { getStudy, listDecisionLog } from "@/server/studies";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(listDecisionLog(id));
}
