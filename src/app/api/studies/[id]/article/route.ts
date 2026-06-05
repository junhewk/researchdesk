import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createArticleFromStudy } from "@/server/studyArticle";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  reuse_existing: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = createArticleFromStudy(id, {
      reuseExisting: parsed.data.reuse_existing ?? true,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "could not create article";
    return NextResponse.json(
      { error: message },
      { status: message === "study not found" ? 404 : 500 },
    );
  }
}
