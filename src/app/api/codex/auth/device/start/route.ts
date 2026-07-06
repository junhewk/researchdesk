import { NextResponse } from "next/server";
import { startCodexLogin, type CodexLoginMode } from "@/server/codexAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { mode?: CodexLoginMode };
    return NextResponse.json(startCodexLogin(body.mode === "device" ? "device" : "browser"));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start Codex login" },
      { status: 400 },
    );
  }
}
