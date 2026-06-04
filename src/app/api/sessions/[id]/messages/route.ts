import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupervisor } from "@/server/supervisor";

const messageSchema = z.object({
  content: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supervisor = getSupervisor();
  try {
    await supervisor.sendMessage(id, parsed.data.content, {
      apiBaseUrl: request.nextUrl.origin,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not send message" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
