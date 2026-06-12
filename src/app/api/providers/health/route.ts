import { NextRequest, NextResponse } from "next/server";
import { apiProviderSchema } from "@/server/apiAgent/providers";
import { checkAllProviders, checkProvider } from "@/server/providerHealth";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers/health          → { providers: ProviderHealth[] }
 * GET /api/providers/health?provider=ollama → single ProviderHealth
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("provider");
  if (raw) {
    const parsed = apiProviderSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `unknown provider: ${raw}` },
        { status: 400 },
      );
    }
    return NextResponse.json(await checkProvider(parsed.data));
  }
  return NextResponse.json({ providers: await checkAllProviders() });
}
