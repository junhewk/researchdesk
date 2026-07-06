import { NextRequest, NextResponse } from "next/server";
import { getCodexAuthStatus } from "@/server/codexAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  return NextResponse.json(await getCodexAuthStatus({ refresh }));
}

