import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setStudyConfidentialityMode } from "@/server/studies";

const patchSchema = z.object({
  mode: z.enum(["cloud_default", "local_only"]),
  consent: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const updated = setStudyConfidentialityMode(
      id,
      parsed.data.mode,
      parsed.data.consent ?? false,
    );
    if (!updated) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not update" },
      { status: 400 },
    );
  }
}
