import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listManuscripts,
  createManuscript,
  autoProvisionProjectFolder,
} from "@/server/manuscripts";
import type { ManuscriptStatus } from "@/server/types";

const createSchema = z.object({
  title: z.string().min(1),
  content_md: z.string().min(1),
  original_file: z.string().optional(),
  file_format: z.string().optional(),
  journal_type: z.string().optional(),
  research_domain: z.string().optional(),
  research_type: z.string().optional(),
  review_request: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const status = searchParams.get("status") as ManuscriptStatus | null;
  const domain = searchParams.get("domain") ?? undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

  const manuscripts = listManuscripts({
    status: status ?? undefined,
    domain,
    limit,
    offset,
  });

  return NextResponse.json(manuscripts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const manuscript = createManuscript(parsed.data);
  // Auto-provision a project folder on disk so the new revise flow has a
  // canonical place to live. Users can relink to their own folder later.
  const linked = autoProvisionProjectFolder(manuscript.id);
  return NextResponse.json(linked, { status: 201 });
}
