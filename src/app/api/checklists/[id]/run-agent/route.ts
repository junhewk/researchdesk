import { NextRequest, NextResponse } from "next/server";
import { apiAgentRequestSchema } from "@/server/apiAgent/providers";
import { runChecklistAgent } from "@/server/apiAgent/workflows";
import { getChecklist } from "@/server/reportingChecklists";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getChecklist(id)) {
    return NextResponse.json({ error: "checklist not found" }, { status: 404 });
  }
  const parsed = apiAgentRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runChecklistAgent({
      checklistId: id,
      config: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "checklist agent failed" },
      { status: 400 },
    );
  }
}
