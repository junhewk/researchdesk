import { NextRequest, NextResponse } from "next/server";
import { listResearchProjects } from "@/server/projects";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return NextResponse.json({
    projects: listResearchProjects({
      limit: limit !== undefined && Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  });
}
