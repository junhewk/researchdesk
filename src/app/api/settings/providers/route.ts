import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPublicProviderSettings,
  updateProviderSettings,
} from "@/server/providerSettings";

export const dynamic = "force-dynamic";

const providerPatchSchema = z.object({
  provider: z
    .enum(["openai", "gemini", "deepseek", "ollama", "lmstudio", "llama_server"]),
  model: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  clearApiKey: z.boolean().optional(),
  baseUrl: z.string().nullable().optional(),
});

const settingsPatchSchema = z.object({
  defaultProvider: z
    .enum(["openai", "gemini", "deepseek", "ollama", "lmstudio", "llama_server"])
    .optional(),
  providers: z.array(providerPatchSchema).optional(),
});

export async function GET() {
  return NextResponse.json(getPublicProviderSettings());
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(updateProviderSettings(parsed.data));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save provider settings",
      },
      { status: 400 },
    );
  }
}
