import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudySupervisor } from "@/server/methods/studySessions";

const messageSchema = z.object({ content: z.string().min(1) });

// Reply to a live study agent pass (e.g. answering a card-proposal's question).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const { sid } = await params;
  const parsed = messageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    getStudySupervisor().sendMessage(sid, parsed.data.content);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not send message" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
