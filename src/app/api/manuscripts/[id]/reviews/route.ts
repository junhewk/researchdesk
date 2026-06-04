import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listReviews, createReview, getReview, updateReview } from "@/server/reviews";
import { getManuscript } from "@/server/manuscripts";
import type { ReviewCategory, RevisionStatus } from "@/server/types";

const createSchema = z.object({
  category: z.enum(["mechanical", "rewrite", "structural", "evidence"]),
  content_md: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  section_ref: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "applied", "dismissed"]).optional(),
  category: z.enum(["mechanical", "rewrite", "structural", "evidence"]).optional(),
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

  const category = searchParams.get("category") as ReviewCategory | null;
  const status = searchParams.get("status") as RevisionStatus | null;

  const reviews = listReviews(id, {
    category: category ?? undefined,
    status: status ?? undefined,
  });

  return NextResponse.json(reviews);
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

  const review = createReview({
    manuscript_id: id,
    ...parsed.data,
  });

  return NextResponse.json(review, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const manuscript = getManuscript(id);
  if (!manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = getReview(parsed.data.id);
  if (!existing || existing.manuscript_id !== id) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { id: reviewId, ...update } = parsed.data;
  const updated = updateReview(reviewId, update);
  if (!updated) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
