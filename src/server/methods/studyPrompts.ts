import { getModeSchema, getCardDef } from "./cardSchema";
import { parseValue } from "./preflight";
import { curlAuthArgs, curlJsonHeaders } from "../../lib/localApiAuth";
import type { Study, DesignDecision, EvidenceSnapshot } from "../types";

// Forked methods prompts for the StudyDesignState workspace. Distinct from the
// document-centric src/server/methodsPrompts.ts: these never edit a document.
// The agent proposes decisions (conversationally) or posts structured rows via
// the curl-callback pattern. CORE_RULES is duplicated here on purpose — the
// methods stack is forked and may diverge.

const CORE_RULES = `## Core rules
- NEVER generate novel research content or decide the study for the user. You propose evidence-grounded options and surface consequences; the user always chooses.
- NEVER play a "hypothetical reviewer persona." Ground every option and risk in the imported evidence or in established methodological principles.
- Prefer the decision the user can act on. When something is unknown, say so and name who could resolve it (statistician, data manager, librarian).`;

export type StudyPass = "card_proposal" | "evidence_extraction" | "preflight_risk";

function apiBase(explicitBase?: string): string {
  return (
    explicitBase ||
    process.env.REVIEWER_API_URL ||
    `http://localhost:${process.env.PORT || "3871"}`
  );
}

function studyHeader(study: Study): string {
  const schema = getModeSchema(study.mode);
  return [
    `STUDY: "${study.title}" (id: \`${study.id}\`)`,
    `MODE: ${schema.label}`,
    study.research_question ? `QUESTION: ${study.research_question}` : null,
    `CONFIDENTIALITY: ${study.confidentiality_mode}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function cardsDigest(study: Study, decisions: DesignDecision[]): string {
  return decisions
    .map((d) => {
      const def = getCardDef(study.mode, d.card_type);
      const value = parseValue(d.value_json);
      const headline = value.value ? ` — ${value.value}` : "";
      return `- ${def?.label ?? d.card_type} [${d.state}]${headline}`;
    })
    .join("\n");
}

export interface StudyPromptContext {
  study: Study;
  decisions: DesignDecision[];
  targetCardType?: string;
  snapshot?: EvidenceSnapshot;
  apiBaseUrl?: string;
}

export function buildStudyPrompt(
  pass: StudyPass,
  ctx: StudyPromptContext,
): string {
  const base = apiBase(ctx.apiBaseUrl);
  const curl = curlAuthArgs();
  const jsonHeaders = curlJsonHeaders();
  const { study } = ctx;

  if (pass === "card_proposal") {
    const def = ctx.targetCardType
      ? getCardDef(study.mode, ctx.targetCardType)
      : undefined;
    return `You help a researcher specify one methodological decision in their study design.

${CORE_RULES}

## Context
${studyHeader(study)}

### Current decisions
${cardsDigest(study, ctx.decisions)}

## Your task
Propose options for the **${def?.label ?? ctx.targetCardType}** decision: "${def?.help ?? ""}"

1. Search the imported evidence for what prior studies did here:
   \`curl ${curl} '${base}/api/studies/${study.id}/evidence'\`
2. Decide on 2–4 concrete options. For EACH, POST one structured option so the
   user can pick it with one click — \`value_suggestion\` is the exact text that
   would go in the card's headline value, \`consequence_md\` is a one-line
   trade-off (feasibility, bias, missingness, comparability):

\`\`\`bash
curl ${curl} -X POST '${base}/api/studies/${study.id}/cards/${ctx.targetCardType ?? "<card_type>"}/proposals' \\
${jsonHeaders}
  --data @- <<'JSON'
{ "label": "30-day all-cause mortality",
  "value_suggestion": "30-day all-cause mortality",
  "consequence_md": "Used by 7 prior RCTs; may need death-registry linkage." }
JSON
\`\`\`

3. Also explain the options in your reply, citing evidence counts, and note the
   required sub-fields the user must still fill: ${(def?.requiredFields ?? []).map((f) => f.label).join(", ") || "(none)"}.
4. STOP. Do not set the value — end by asking the user to choose (they pick via
   "Use this" or by editing the card).`;
  }

  if (pass === "evidence_extraction") {
    return `You mine an imported research-evidence snapshot for design-relevant items.

${CORE_RULES}

## Context
${studyHeader(study)}

## Your task
The snapshot (id \`${ctx.snapshot?.id ?? "<snapshot_id>"}\`, source ${ctx.snapshot?.source ?? "?"}) is a deep-research report / wiki / knowledge graph. Read it:
\`curl ${curl} '${base}/api/studies/${study.id}/snapshots/${ctx.snapshot?.id ?? "<snapshot_id>"}'\`

Extract design-relevant items and POST each as one evidence item. Group by kind:
prior_design, population, outcome, confounder, bias, measure, other.

\`\`\`bash
curl ${curl} -X POST '${base}/api/studies/${study.id}/evidence/items' \\
${jsonHeaders}
  --data @- <<'JSON'
{ "kind": "outcome", "label": "28-day mortality",
  "detail_md": "Used as the primary outcome in 7 prior RCTs in this snapshot.",
  "snapshot_id": "${ctx.snapshot?.id ?? "<snapshot_id>"}" }
JSON
\`\`\`

Do NOT invent items not supported by the snapshot. End with a count per kind.`;
  }

  // preflight_risk
  return `You audit a study design for methodological RISK (not completeness — that is computed deterministically).

${CORE_RULES}

## Context
${studyHeader(study)}

### Current decisions
${cardsDigest(study, ctx.decisions)}

## Your task
Fetch the full card values:
\`curl ${curl} '${base}/api/studies/${study.id}/cards'\`

Identify concrete methodological risks given the decisions made so far — e.g. immortal-time bias (exposure window starting after cohort entry), confounding by indication, outcome measured before exposure, selection bias from eligibility, unplanned multiplicity. For each risk, POST one finding:

\`\`\`bash
curl ${curl} -X POST '${base}/api/studies/${study.id}/preflight/findings' \\
${jsonHeaders}
  --data @- <<'JSON'
{ "layer": "risk", "severity": "blocking", "card_type": "exposure",
  "title": "Immortal-time bias risk",
  "detail_md": "Exposure is ascertained after cohort entry; person-time before exposure is misclassified." }
JSON
\`\`\`

severity is one of blocking | important | minor. Only post risks grounded in the actual decisions. End with the count of risks by severity.`;
}
