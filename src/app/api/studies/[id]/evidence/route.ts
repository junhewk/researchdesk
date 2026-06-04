import { NextRequest, NextResponse } from "next/server";
import { getStudy, listEvidenceItems } from "@/server/studies";
import type { EvidenceItem } from "@/server/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const items = listEvidenceItems(id);
  const grouped: Record<string, EvidenceItem[]> = {};
  for (const item of items) {
    (grouped[item.kind] ??= []).push(item);
  }
  return NextResponse.json({ items, grouped });
}
