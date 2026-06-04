import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getStudy,
  updateStudy,
  deleteStudy,
  listDecisions,
} from "@/server/studies";
import { deleteStudyExport } from "@/server/methods/studyExport";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  research_question: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json({ study, decisions: listDecisions(id) });
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
  const updated = updateStudy(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteStudy(id);
  if (!deleted) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  deleteStudyExport(id);
  return new NextResponse(null, { status: 204 });
}
