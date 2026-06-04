import { NextRequest, NextResponse } from "next/server";
import { compileLetter, getReviewerResponse } from "@/server/reviewerResponses";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReviewerResponse(id)) {
    return NextResponse.json({ error: "response not found" }, { status: 404 });
  }
  try {
    const result = compileLetter(id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "compile failed" },
      { status: 400 },
    );
  }
}
