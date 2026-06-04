import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getReviewerResponse,
  listResponseItems,
  updateResponse,
} from "@/server/reviewerResponses";

const patchSchema = z.object({
  status: z.enum(["drafting", "ready", "submitted"]).optional(),
  summary_md: z.string().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = getReviewerResponse(id);
  if (!response) {
    return NextResponse.json({ error: "response not found" }, { status: 404 });
  }
  return NextResponse.json({ ...response, items: listResponseItems(id) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getReviewerResponse(id)) {
    return NextResponse.json({ error: "response not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(updateResponse(id, parsed.data));
}
