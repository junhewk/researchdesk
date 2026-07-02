import { NextRequest, NextResponse } from "next/server";
import { listStudyArticleImportOptions } from "@/server/studyArticle";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return NextResponse.json({
    options: listStudyArticleImportOptions({
      limit: limit !== undefined && Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  });
}
