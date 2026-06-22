import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  computePrismaFlow,
  renderPrismaMarkdown,
  listSearches,
} from "@/server/methods/reviewCorpus";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json({
    flow: computePrismaFlow(id),
    markdown: renderPrismaMarkdown(id),
    searches: listSearches(id),
  });
}
