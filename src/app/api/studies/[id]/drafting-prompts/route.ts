import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  compileStudyDraftingPrompts,
  renderGeneratedAgentsMd,
  renderGeneratedDraftMd,
  ALL_TASKS,
  type DraftTask,
} from "@/server/methods/studyDraftingPrompts";
import { exportStudyDraftingPrompts } from "@/server/methods/studyExport";
import {
  apiAgentRequestSchema,
  providerFieldWasProvided,
  requireLocalApiProvider,
  resolveApiProvider,
} from "@/server/apiAgent/providers";
import { runArticleHarnessAgent } from "@/server/apiAgent/workflows";
import { classifyAgentError } from "@/server/providerHealth";

// Generate article-writing prompts from a deterministic grounding pack with a
// structured LLM pass. The old aggregate deterministic prompt is intentionally
// not a fallback: if the provider cannot create a valid harness, the caller gets
// an actionable provider error and can retry.
//
// Optional JSON body:
//   { sections?: DraftTask[];  // subset of outline/introduction/methodology/
//                              // results/discussion/abstract (default: per-mode)
//     task?: string,           // a freeform instruction to wrap with the grounding
//     provider/model/api_key/base_url/timeout_ms?: ... }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "study not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sections?: unknown;
    task?: unknown;
  };
  const parsed = apiAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const requested = Array.isArray(body.sections)
    ? (body.sections.filter(
        (s): s is DraftTask => ALL_TASKS.includes(s as DraftTask),
      ) as DraftTask[])
    : null;

  const freeform =
    typeof body.task === "string" && body.task.trim() ? body.task : null;
  let provider = resolveApiProvider(
    parsed.data.provider,
    providerFieldWasProvided(body),
  );
  if (study.confidentiality_mode === "local_only") {
    const local = requireLocalApiProvider(
      parsed.data.provider,
      providerFieldWasProvided(body),
    );
    if (local.error || !local.provider) {
      return NextResponse.json({ error: local.error }, { status: 400 });
    }
    provider = local.provider;
  }

  try {
    const harness = await runArticleHarnessAgent({
      studyId: id,
      sections: requested ?? undefined,
      task: freeform,
      config: {
        provider,
        model: parsed.data.model,
        apiKey: parsed.data.api_key,
        baseUrl: parsed.data.base_url,
        timeoutMs: parsed.data.timeout_ms,
        maxToolSteps: parsed.data.max_tool_steps,
      },
    });
    const content = compileStudyDraftingPrompts(id);
    const agentsMd = renderGeneratedAgentsMd(content, harness);
    const draftMd = renderGeneratedDraftMd(content, harness);
    exportStudyDraftingPrompts(id, { agentsMd, draftMd });

    return NextResponse.json({
      source: "agent",
      harnessVersion: 1,
      methodology: harness.methodology,
      sections: harness.sections,
      combinedPrompt: harness.combinedPrompt,
      taskPrompts: harness.taskPrompts,
      agentsMd,
      freeformPrompt: harness.freeformPrompt,
      qualityWarnings: harness.qualityWarnings,
      unresolvedQuestions: harness.unresolvedQuestions,
      hasDesign: harness.hasDesign,
      hasCorpus: harness.hasCorpus,
    });
  } catch (err) {
    const classified = classifyAgentError(err, provider);
    return NextResponse.json(
      { error: classified.message, error_code: classified.code, fix: classified.fix },
      { status: 400 },
    );
  }
}
