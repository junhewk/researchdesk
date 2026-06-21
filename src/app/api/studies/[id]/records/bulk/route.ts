import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudy } from "@/server/studies";
import { bulkPatch, recordStats } from "@/server/methods/reviewCorpus";

const decisionEnum = z.enum(["include", "exclude", "maybe", "unscreened"]);

// Apply a decision (and/or confirmation) to many records at once, selected
// either by explicit `ids` or by the current `filter`.
const bodySchema = z.object({
  ids: z.array(z.string()).optional(),
  filter: z
    .object({
      decision: decisionEnum.optional(),
      tier: z.string().optional(),
      confidence: z.string().optional(),
      needs_review: z.boolean().optional(),
    })
    .optional(),
  decision: decisionEnum.optional(),
  user_confirmed: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const changed = bulkPatch(id, parsed.data);
  return NextResponse.json({ changed, stats: recordStats(id) });
}
