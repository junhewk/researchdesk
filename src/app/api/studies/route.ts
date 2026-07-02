import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listStudies, createStudy } from "@/server/studies";
import type { StudyMode, StudyStatus } from "@/server/types";

const createSchema = z.object({
  title: z.string().min(1),
  mode: z.enum([
    "systematic_review",
    "scoping_review",
    "retrospective_observational",
    "interventional",
  ]),
  research_question: z.string().optional(),
  confidentiality_mode: z.enum(["cloud_default", "local_only"]).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = (searchParams.get("status") as StudyStatus | null) ?? undefined;
  const mode = (searchParams.get("mode") as StudyMode | null) ?? undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;
  return NextResponse.json(listStudies({ status, mode, limit, offset }));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (
    body &&
    typeof body === "object" &&
    "source_manuscript_id" in body &&
    body.source_manuscript_id
  ) {
    return NextResponse.json(
      {
        error:
          "Studies must be created from Methods Workbench, not imported from My Articles.",
      },
      { status: 400 },
    );
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const study = createStudy({
    title: parsed.data.title,
    mode: parsed.data.mode,
    research_question: parsed.data.research_question,
    confidentiality_mode: parsed.data.confidentiality_mode,
  });
  return NextResponse.json(study, { status: 201 });
}
