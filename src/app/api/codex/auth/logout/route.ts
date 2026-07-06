import { NextResponse } from "next/server";
import { logoutCodex } from "@/server/codexAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await logoutCodex());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not log out of Codex" },
      { status: 400 },
    );
  }
}

