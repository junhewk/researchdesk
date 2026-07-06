import { NextRequest, NextResponse } from "next/server";
import { cancelCodexLogin } from "@/server/codexAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { id?: string };
  const status = cancelCodexLogin(body.id ?? null);
  if (!status) {
    return NextResponse.json({ error: "Codex login session not found" }, { status: 404 });
  }
  return NextResponse.json(status);
}
