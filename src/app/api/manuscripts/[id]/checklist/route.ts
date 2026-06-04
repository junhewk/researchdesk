import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getManuscript } from "@/server/manuscripts";
import {
  createChecklist,
  listChecklists,
} from "@/server/reportingChecklists";

const GUIDELINES = [
  "PRISMA",
  "PRISMA-P",
  "STROBE",
  "CONSORT",
  "SPIRIT",
  "STARD",
  "TRIPOD",
  "CARE",
  "SRQR",
  "COREQ",
  "ARRIVE",
] as const;

const postSchema = z.object({
  guideline: z.enum(GUIDELINES),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getManuscript(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  return NextResponse.json(listChecklists("manuscript", id));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getManuscript(id)) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const checklist = createChecklist({
      subject_type: "manuscript",
      subject_id: id,
      guideline: parsed.data.guideline,
    });
    return NextResponse.json(checklist, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not create" },
      { status: 400 },
    );
  }
}
