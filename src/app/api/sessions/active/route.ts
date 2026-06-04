import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/server/sessionQueries";
import type { Workflow } from "@/server/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const manuscriptId = searchParams.get("manuscript_id");
  const workflow = searchParams.get("workflow") as Workflow | null;

  if (!manuscriptId || !workflow) {
    return NextResponse.json({ error: "manuscript_id and workflow required" }, { status: 400 });
  }

  const session = getActiveSession(manuscriptId, workflow);

  return NextResponse.json(session ?? null);
}
