import { NextRequest, NextResponse } from "next/server";
import { buildInspector } from "@/server/methods/inspector";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const view = buildInspector(id);
  if (!view) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json(view);
}
