import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDiagram, listDiagrams, validateMermaidSource } from "@/server/diagrams";
import { getManuscript } from "@/server/manuscripts";

const createSchema = z.object({
  kind: z.enum(["logic", "narrative"]),
  title: z.string().optional(),
  mermaid_src: z.string().min(1),
  notes_md: z.string().optional(),
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
  const diagrams = listDiagrams(id, "owned");
  return NextResponse.json(diagrams);
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

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const validation = validateMermaidSource(parsed.data.mermaid_src);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const diagram = createDiagram({
    manuscript_id: id,
    manuscript_kind: "owned",
    kind: parsed.data.kind,
    title: parsed.data.title,
    mermaid_src: parsed.data.mermaid_src,
    notes_md: parsed.data.notes_md,
  });
  return NextResponse.json(diagram, { status: 201 });
}
