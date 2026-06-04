import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getManuscript } from "@/server/manuscripts";
import {
  listRevisionTables,
  recordRevisionTable,
} from "@/server/revisionTables";

const recordSchema = z.object({
  session_id: z.string().optional(),
  round: z.number().int().positive().optional(),
  relative_path: z.string().min(1),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = getManuscript(id);
  if (!m) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  const tables = listRevisionTables(id);
  return NextResponse.json(tables);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const m = getManuscript(id);
  if (!m) {
    return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });
  }
  if (!m.project_root) {
    return NextResponse.json(
      { error: "Manuscript is not folder-linked" },
      { status: 400 },
    );
  }
  const body = await request.json();
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const full = path.join(m.project_root, parsed.data.relative_path);
  if (!fs.existsSync(full)) {
    return NextResponse.json(
      { error: `file not found in project: ${parsed.data.relative_path}` },
      { status: 400 },
    );
  }
  const created = recordRevisionTable({
    manuscript_id: id,
    session_id: parsed.data.session_id ?? null,
    round: parsed.data.round,
    relative_path: parsed.data.relative_path,
  });
  return NextResponse.json(created, { status: 201 });
}
