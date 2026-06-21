import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import { listRecords, recordStats, type RecordFilters } from "@/server/methods/reviewCorpus";
import type { ScreeningDecision } from "@/server/types";

const DECISIONS = ["include", "exclude", "maybe", "unscreened"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const sp = request.nextUrl.searchParams;
  const decision = sp.get("decision");
  const needsReview = sp.get("needs_review");
  const filters: RecordFilters = {
    decision:
      decision && DECISIONS.includes(decision)
        ? (decision as ScreeningDecision)
        : undefined,
    tier: sp.get("tier") || undefined,
    confidence: sp.get("confidence") || undefined,
    needs_review:
      needsReview === "1" || needsReview === "true"
        ? true
        : needsReview === "0" || needsReview === "false"
          ? false
          : undefined,
    q: sp.get("q") || undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  };
  const { records, total } = listRecords(id, filters);
  return NextResponse.json({ records, total, stats: recordStats(id) });
}
