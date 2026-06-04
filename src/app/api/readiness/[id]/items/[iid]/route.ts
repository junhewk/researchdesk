import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setReadinessItemStatus } from "@/server/readinessChecks";

const patchSchema = z.object({
  status: z.enum(["open", "accepted", "dismissed"]),
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
  const updated = setReadinessItemStatus(iid, parsed.data.status);
  if (!updated) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
