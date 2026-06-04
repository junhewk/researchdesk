import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateResponseItem } from "@/server/reviewerResponses";

const patchSchema = z.object({
  response_md: z.string().optional().nullable(),
  change_pointer_md: z.string().optional().nullable(),
  revision_ids_json: z.string().optional().nullable(),
  status: z.enum(["drafting", "accepted", "declined"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> },
) {
  const { iid } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = updateResponseItem(iid, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
