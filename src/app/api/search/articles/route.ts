import { NextRequest, NextResponse } from "next/server";
import { searchArticles } from "@/server/articleSearch";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  const results = await searchArticles({
    query,
    yearFrom: searchParams.get("year_from") ? Number(searchParams.get("year_from")) : undefined,
    yearTo: searchParams.get("year_to") ? Number(searchParams.get("year_to")) : undefined,
    source: (searchParams.get("source") as "semantic_scholar" | "openalex" | "both") ?? "both",
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 10,
  });

  return NextResponse.json(results);
}
