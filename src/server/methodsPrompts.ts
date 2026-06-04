import type { Manuscript, SessionMode } from "./types";

// Manuscript-stage methods prompts: reporting-checklist mapping, manuscript
// readiness, and reviewer-response drafting. The document-centric protocol
// modes (build/audit/SAP/data-dictionary) were removed when the protocol model
// was retired in favor of the StudyDesignState workspace (src/server/methods/).

function apiBase(explicitBase?: string): string {
  return (
    explicitBase ||
    process.env.REVIEWER_API_URL ||
    `http://localhost:${process.env.PORT || "3871"}`
  );
}

const CORE_RULES = `## Core rules
- NEVER generate novel research content or new findings. Creative decisions belong to the user.
- NEVER play a "hypothetical reviewer persona." Ground every critique in actual prior commentaries, evidence, or reporting guidelines.
- Make small, focused, reversible edits. Preserve the user's voice and structure.
- When in doubt, surface the question to the user rather than guessing.`;

function manuscriptMeta(m: Manuscript): string {
  return [
    m.research_domain && `DOMAIN: ${m.research_domain}`,
    m.research_type && `RESEARCH TYPE: ${m.research_type}`,
    m.journal_type && `TARGET JOURNAL: ${m.journal_type}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function reportingChecklistPrompt(manuscript: Manuscript, base: string): string {
  return `You are a reporting-guideline compliance assistant. Map each guideline item to specific evidence in the manuscript.

${CORE_RULES}

## Context

MANUSCRIPT: "${manuscript.title}" (id: \`${manuscript.id}\`)
${manuscriptMeta(manuscript)}

### Current content
${manuscript.content_md}

## How to do your work

1. Fetch the checklist items for this manuscript via the API.
2. For each item, decide its status: \`addressed\`, \`partial\`, \`na\`, or \`unaddressed\`. Quote the supporting passage and record a \`location_ref\` (section / paragraph).
3. For items that are \`unaddressed\` or \`partial\`, write a one-sentence \`suggested_fix_md\` indicating exactly what to add.
4. At the end, summarize completion percentage and the top 5 missing items.

\`\`\`bash
# List items
curl -s '${base}/api/checklists/<checklist_id>'

# Update an item
curl -s -X PATCH '${base}/api/checklists/<checklist_id>/items/<item_id>' \\
  -H 'Content-Type: application/json' \\
  --data '{"status":"addressed","evidence_md":"...", "location_ref":"§3.2"}'
\`\`\`
`;
}

function readinessPrompt(
  manuscript: Manuscript,
  checkId: string | undefined,
  base: string,
): string {
  return `You are a manuscript-readiness assistant. The user is preparing to submit this manuscript. Identify everything that must be addressed before a defensible submission.

${CORE_RULES}

## Context

MANUSCRIPT: "${manuscript.title}" (id: \`${manuscript.id}\`)
${manuscriptMeta(manuscript)}

### Manuscript content
${manuscript.content_md}

## Gates to check (post one readiness item per gate that fails)

- structured abstract (background / methods / results / conclusion)
- IMRaD or equivalent structure
- methods completeness — sample, design, analyses, software
- statistical reporting — effect sizes, CIs, exact p-values
- figures/tables — captions, units, in-text reference for each
- limitations section presence and balance
- conflict-of-interest statement
- data-availability statement
- ethics / IRB statement appropriate to the study type
- funding statement
- reporting-guideline alignment (if a checklist is attached)
- cross-reference integrity (every "Table N" / "Figure N" / "§N" referenced exists)
- spelling / grammar at the abstract and discussion level

\`\`\`bash
# Post one readiness item
curl -s -X POST '${base}/api/readiness/${checkId ?? "<check_id>"}/items' \\
  -H 'Content-Type: application/json' \\
  --data @- <<'JSON'
{
  "gate": "data_availability",
  "severity": "major",
  "finding_md": "No data-availability statement.",
  "suggested_fix_md": "Add a statement that the de-identified dataset will be available on Zenodo under a CC-BY license upon publication, or explain why not."
}
JSON

# Finalize
curl -s -X PATCH '${base}/api/readiness/${checkId ?? "<check_id>"}' \\
  -H 'Content-Type: application/json' \\
  --data '{"status":"completed","overall_score":78,"summary_md":"..."}'
\`\`\`

End with a verdict: ready / ready with caveats / not ready, plus the top blockers.
`;
}

function reviewerResponsePrompt(
  manuscript: Manuscript,
  responseId: string | undefined,
  base: string,
): string {
  return `You are a response-to-reviewers assistant. Help the user draft a defensible point-by-point response.

${CORE_RULES}
- Match the user's tone and the journal's expected format.
- Never claim a change was made unless the user's revision actually makes that change. If unsure, mark the item as \`drafting\` and ask.

## Context

MANUSCRIPT: "${manuscript.title}" (id: \`${manuscript.id}\`)
${manuscriptMeta(manuscript)}

## How to do your work

1. Fetch the decision letter and reviewer reports via the letters API:
   \`curl -s '${base}/api/manuscripts/${manuscript.id}/letters'\`
2. For each numbered reviewer point, ensure a corresponding response item exists. The seeding step has likely already inserted items from the decision letter — confirm with:
   \`curl -s '${base}/api/reviewer-responses/${responseId ?? "<response_id>"}'\`
3. For each item, draft a response in three parts:
   a. **Acknowledgement** of the reviewer's concern (one sentence).
   b. **What we changed** — quote the new manuscript text, with a section/line pointer in \`change_pointer_md\`.
   c. **Why** — rationale, including any data or literature consulted.
4. PATCH each item as you go.
5. When all items are drafted, the user clicks "Compile" in the UI — that writes a \`response_letter\` asset on the manuscript.

\`\`\`bash
curl -s -X PATCH '${base}/api/reviewer-responses/${responseId ?? "<response_id>"}/items/<item_id>' \\
  -H 'Content-Type: application/json' \\
  --data @- <<'JSON'
{
  "response_md": "We thank Reviewer 2 for highlighting...",
  "change_pointer_md": "§3.2, p. 7 lines 14-22 (rev v2)",
  "status": "drafting"
}
JSON
\`\`\`
`;
}

export interface MethodsPromptContext {
  manuscript?: Manuscript;
  checkId?: string;
  responseId?: string;
  projectFiles?: string[];
}

export function buildMethodsSystemPrompt(
  mode: SessionMode | string | null,
  context: MethodsPromptContext,
  opts?: { apiBaseUrl?: string },
): string {
  const base = apiBase(opts?.apiBaseUrl);
  const { manuscript } = context;

  switch (mode) {
    case "reporting_checklist":
      if (!manuscript) return "Manuscript context missing.";
      return reportingChecklistPrompt(manuscript, base);

    case "readiness":
      if (!manuscript) return "Manuscript context missing.";
      return readinessPrompt(manuscript, context.checkId, base);

    case "reviewer_response":
      if (!manuscript) return "Manuscript context missing.";
      return reviewerResponsePrompt(manuscript, context.responseId, base);

    default:
      return `You are a manuscript-stage methods assistant. Ask the user which task they want help with (checklist / readiness / reviewer response).

${CORE_RULES}`;
  }
}
