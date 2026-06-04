import { NextRequest, NextResponse } from "next/server";
import { validateDoi } from "@/server/articleSearch";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const doi = searchParams.get("doi");
  if (!doi) {
    return NextResponse.json(
      { error: "doi query parameter required" },
      { status: 400 },
    );
  }
  const result = await validateDoi(doi);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { doi?: string };
  if (!body.doi) {
    return NextResponse.json({ error: "doi required" }, { status: 400 });
  }
  const result = await validateDoi(body.doi);
  return NextResponse.json(result);
}
