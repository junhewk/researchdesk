import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLanguageSettings,
  setAppLanguage,
} from "@/server/appLanguage";

export const dynamic = "force-dynamic";

const languagePatchSchema = z.object({
  language: z.enum(["en", "ko"]),
});

export async function GET() {
  return NextResponse.json(getLanguageSettings());
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = languagePatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  setAppLanguage(parsed.data.language);

  return NextResponse.json(getLanguageSettings());
}
