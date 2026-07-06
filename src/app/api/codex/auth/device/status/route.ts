import { NextRequest, NextResponse } from "next/server";
import { getCodexLogin } from "@/server/codexAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const status = getCodexLogin(id);
  if (!status) {
    return NextResponse.json({ error: "Codex login session not found" }, { status: 404 });
  }
  return NextResponse.json(status);
}
