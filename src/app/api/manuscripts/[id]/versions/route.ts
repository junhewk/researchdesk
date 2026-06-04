import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import {
  appendManuscriptVersion,
  listManuscriptVersions,
} from "@/server/manuscriptVersions";

const postSchema = z.object({
  content_md: z.string().min(1, "content_md required"),
  label: z.string().trim().optional().nullable(),
  source: z
    .enum(["agent_revise", "user_edit"])
    .optional()
    .default("agent_revise"),
  session_id: z.string().trim().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const exists = getDb()
    .prepare("SELECT id FROM manuscripts WHERE id = ?")
    .get(id);
  if (!exists) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }
  // Don't ship full content_md for every version in the list response —
  // it would blow up payloads. Caller fetches individual versions only
  // when they're actually being diffed.
  const versions = listManuscriptVersions(id).map((v) => ({
    id: v.id,
    manuscript_id: v.manuscript_id,
    version_number: v.version_number,
    label: v.label,
    source: v.source,
    session_id: v.session_id,
    content_md: v.content_md,
    created_at: v.created_at,
  }));
  return NextResponse.json(versions);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const exists = getDb()
    .prepare("SELECT id FROM manuscripts WHERE id = ?")
    .get(id);
  if (!exists) {
    return NextResponse.json({ error: "manuscript not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created = appendManuscriptVersion({
    manuscriptId: id,
    content_md: parsed.data.content_md,
    label: parsed.data.label ?? null,
    source: parsed.data.source,
    session_id: parsed.data.session_id ?? null,
  });

  return NextResponse.json(created, { status: 201 });
}
