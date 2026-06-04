import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listCommentaries, createCommentary } from "@/server/commentaries";
import { getManuscript } from "@/server/manuscripts";

const createSchema = z.object({
  content_md: z.string().min(1),
  reviewer_label: z.string().optional(),
  round: z.number().int().positive().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  const round = searchParams.get("round") ? Number(searchParams.get("round")) : undefined;
  const commentaries = listCommentaries(id, round);

  return NextResponse.json(commentaries);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const commentary = createCommentary({
    manuscript_id: id,
    ...parsed.data,
  });

  return NextResponse.json(commentary, { status: 201 });
}
