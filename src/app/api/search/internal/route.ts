import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  searchCommentaries,
  searchRevisions,
  searchReviews,
  searchManuscripts,
} from "@/server/search";
import type { SearchResult } from "@/server/types";

const searchParamsSchema = z.object({
  q: z.string().min(1),
  type: z.enum(["commentaries", "revisions", "reviews", "manuscripts"]).optional(),
  research_domain: z.string().optional(),
  journal_type: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const raw = {
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    research_domain: searchParams.get("research_domain") ?? undefined,
    journal_type: searchParams.get("journal_type") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  };

  const parsed = searchParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { q, type, research_domain, journal_type, category, status, limit } = parsed.data;

  const opts = { query: q, research_domain, journal_type, category, status, limit };

  let results: SearchResult[] = [];

  if (!type || type === "commentaries") {
    results = results.concat(searchCommentaries(opts));
  }
  if (!type || type === "revisions") {
    results = results.concat(searchRevisions(opts));
  }
  if (!type || type === "reviews") {
    results = results.concat(searchReviews(opts));
  }
  if (!type || type === "manuscripts") {
    results = results.concat(searchManuscripts(q, limit));
  }

  // Sort combined results by rank (lower = better match in FTS5)
  results.sort((a, b) => a.rank - b.rank);

  if (limit) {
    results = results.slice(0, limit);
  }

  return NextResponse.json(results);
}
