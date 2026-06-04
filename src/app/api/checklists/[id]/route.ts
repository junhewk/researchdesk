import { NextRequest, NextResponse } from "next/server";
import { getChecklist, listChecklistItems } from "@/server/reportingChecklists";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const checklist = getChecklist(id);
  if (!checklist) {
    return NextResponse.json({ error: "checklist not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...checklist,
    items: listChecklistItems(id),
  });
}
