import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runPython } from "@/server/pythonSandbox";

const inputSchema = z.object({
  code: z.string().min(1).max(64 * 1024),
  stdin: z.string().max(64 * 1024).optional(),
  timeout_ms: z.number().int().min(500).max(30_000).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (process.env.REVIEWER_DATA_DIR) {
    await mkdir(path.join(process.env.REVIEWER_DATA_DIR, "sandbox"), {
      recursive: true,
    }).catch(() => undefined);
  }

  try {
    const result = await runPython({
      code: parsed.data.code,
      stdin: parsed.data.stdin,
      timeoutMs: parsed.data.timeout_ms,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "python_check failed" },
      { status: 500 },
    );
  }
}
