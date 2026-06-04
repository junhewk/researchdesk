import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getManuscript, updateManuscript, deleteManuscript } from "@/server/manuscripts";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content_md: z.string().min(1).optional(),
  journal_type: z.string().optional(),
  research_domain: z.string().optional(),
  research_type: z.string().optional(),
  review_request: z.string().optional(),
  status: z.enum(["draft", "in_revision", "in_review", "completed"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manuscript = getManuscript(id);

  if (!manuscript) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  return NextResponse.json(manuscript);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = updateManuscript(id, parsed.data);

  if (!updated) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteManuscript(id);

  if (!deleted) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
