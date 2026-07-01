import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getStudy,
  clearProposalOptions,
  createProposalOption,
  listDecisions,
  listEvidenceItems,
} from "@/server/studies";
import { getStudySupervisor } from "@/server/methods/studySessions";
import { buildSeedProposalOptions } from "@/server/methods/proposals";
import type { Provider } from "@/server/types";
import {
  apiProviderSchema,
  providerFieldWasProvided,
  requireLocalApiProvider,
  resolveApiProvider,
} from "@/server/apiAgent/providers";

const bodySchema = z.object({
  provider: apiProviderSchema.optional(),
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let provider: Provider = resolveApiProvider(
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

  const sup = getStudySupervisor();
  try {
    const session = sup.createSession({
      studyId: id,
      pass: "card_proposal",
      provider,
      model: parsed.data.model,
      effort: parsed.data.effort,
    });
    // Replace any previous options for this card before the new pass runs.
    clearProposalOptions(id, type);
    const seeded = buildSeedProposalOptions({
      study,
      decisions: listDecisions(id),
      evidence: listEvidenceItems(id),
      cardType: type,
    });
    for (const option of seeded) {
      createProposalOption({
        study_id: id,
        card_type: type,
        session_id: session.id,
        label: option.label,
        value_suggestion: option.value_suggestion,
        fields_suggestion: option.fields_suggestion,
        consequence_md: option.consequence_md,
      });
    }
    const apiBaseUrl = process.env.REVIEWER_API_URL || request.nextUrl.origin;
    await sup.startPass(session.id, { apiBaseUrl, targetCardType: type });
    return NextResponse.json(
      { session_id: session.id, seeded_options: seeded.length },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start proposal" },
      { status: 400 },
    );
  }
}
