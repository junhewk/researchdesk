import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateFindingStatus } from "@/server/studies";

const patchSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> },
) {
  const { fid } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  updateFindingStatus(fid, parsed.data.status);
  return NextResponse.json({ ok: true });
}
