import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { reorderAssets } from "@/server/manuscriptAssets";

const postSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const assets = reorderAssets(id, parsed.data.order);
  return NextResponse.json(assets);
}
