import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupervisor } from "@/server/supervisor";

const startSchema = z.object({
  initial_message: z.string().trim().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supervisor = getSupervisor();
  try {
    await supervisor.startSession(id, {
      apiBaseUrl: request.nextUrl.origin,
      initialMessage: parsed.data.initial_message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start session" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
