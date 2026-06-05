import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runQuantitativeCheck } from "@/server/quantitative";

export const dynamic = "force-dynamic";

const alternativeSchema = z.enum(["two_sided", "less", "greater"]).optional();

const inputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("two_sample_ttest_from_stats"),
    mean1: z.number(),
    sd1: z.number(),
    n1: z.number(),
    mean2: z.number(),
    sd2: z.number(),
    n2: z.number(),
    alternative: alternativeSchema,
  }),
  z.object({
    kind: z.literal("one_sample_ttest_from_stats"),
    mean: z.number(),
    sd: z.number(),
    n: z.number(),
    mu: z.number().optional(),
    alternative: alternativeSchema,
  }),
  z.object({
    kind: z.literal("proportion_ci"),
    events: z.number(),
    total: z.number(),
    confidence: z.number().optional(),
  }),
  z.object({
    kind: z.literal("risk_ratio"),
    exposedEvents: z.number(),
    exposedTotal: z.number(),
    controlEvents: z.number(),
    controlTotal: z.number(),
    confidence: z.number().optional(),
  }),
  z.object({
    kind: z.literal("odds_ratio"),
    exposedEvents: z.number(),
    exposedNonEvents: z.number(),
    controlEvents: z.number(),
    controlNonEvents: z.number(),
    confidence: z.number().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(runQuantitativeCheck(parsed.data));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "quantitative check failed",
      },
      { status: 400 },
    );
  }
}
