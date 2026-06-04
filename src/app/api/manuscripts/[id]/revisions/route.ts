import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRevisions, createRevision } from "@/server/revisions";
import { getManuscript } from "@/server/manuscripts";
import type { SuggestionCategory, RevisionStatus } from "@/server/types";

const createSchema = z.object({
  commentary_id: z.string().optional(),
  category: z.enum(["mechanical", "rewrite"]),
  suggestion_md: z.string().min(1),
  revised_md: z.string().optional(),
  rewrite_context: z.string().optional(),
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
  const category = searchParams.get("category") as SuggestionCategory | null;
  const status = searchParams.get("status") as RevisionStatus | null;

  const revisions = listRevisions(id, {
    round,
    category: category ?? undefined,
    status: status ?? undefined,
  });

  return NextResponse.json(revisions);
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

  const revision = createRevision({
    manuscript_id: id,
    ...parsed.data,
  });

  return NextResponse.json(revision, { status: 201 });
}
