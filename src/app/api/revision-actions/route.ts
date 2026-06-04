import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRevisionAction, listRevisionActions } from "@/server/revisions";

const createSchema = z.object({
  label: z.string().min(1),
  action_type: z.enum(["find_replace", "rewrite_pattern", "style_rule"]),
  config_json: z.string().min(1),
});

export async function GET() {
  return NextResponse.json(listRevisionActions());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const action = createRevisionAction(parsed.data);
  return NextResponse.json(action, { status: 201 });
}
