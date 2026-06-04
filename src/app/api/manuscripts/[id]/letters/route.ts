import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listCommentaries, createCommentary } from "@/server/commentaries";
import { getManuscript } from "@/server/manuscripts";

const LETTER_SOURCES = new Set([
  "decision_letter",
  "reviewer_report",
  "prior_response",
]);

const createSchema = z.object({
  content_md: z.string().min(1),
  source: z.enum(["decision_letter", "reviewer_report", "prior_response"]),
  reviewer_label: z.string().optional(),
  round: z.number().int().positive().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  const { searchParams } = request.nextUrl;
  const round = searchParams.get("round")
    ? Number(searchParams.get("round"))
    : undefined;
  const all = listCommentaries(id, round);
  const filtered = all.filter((c) => c.source && LETTER_SOURCES.has(c.source));
  return NextResponse.json(filtered);
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
  const created = createCommentary({
    manuscript_id: id,
    content_md: parsed.data.content_md,
    reviewer_label: parsed.data.reviewer_label ?? "Editor",
    source: parsed.data.source,
    round: parsed.data.round,
  });
  return NextResponse.json(created, { status: 201 });
}
