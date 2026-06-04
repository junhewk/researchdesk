import { NextRequest, NextResponse } from "next/server";
import {
  autoDetectChecklistItems,
  getChecklist,
} from "@/server/reportingChecklists";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getChecklist(id)) {
    return NextResponse.json({ error: "checklist not found" }, { status: 404 });
  }
  const result = autoDetectChecklistItems(id);
  return NextResponse.json(result);
}
