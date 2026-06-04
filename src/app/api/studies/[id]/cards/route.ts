import { NextRequest, NextResponse } from "next/server";
import { getStudy, listDecisions, listEvidenceLinks } from "@/server/studies";
import { getCardDef, getCardStage } from "@/server/methods/cardSchema";
import { parseValue } from "@/server/methods/preflight";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const cards = listDecisions(id).map((d) => {
    const def = getCardDef(study.mode, d.card_type);
    return {
      id: d.id,
      card_type: d.card_type,
      label: def?.label ?? d.card_type,
      stage: getCardStage(study.mode, d.card_type),
      help: def?.help ?? "",
      requiredFields: def?.requiredFields ?? [],
      dependsOn: def?.dependsOn ?? [],
      evidenceKinds: def?.evidenceKinds ?? [],
      state: d.state,
      stale: d.stale,
      position: d.position,
      value: parseValue(d.value_json),
      open_question_md: d.open_question_md,
      evidence: listEvidenceLinks(d.id),
    };
  });
  return NextResponse.json({ study, cards });
}
