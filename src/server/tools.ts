import {
  buildMethodsSystemPrompt,
  type MethodsPromptContext,
} from "./methodsPrompts";
import { curlAuthArgs, curlJsonHeaders, getApiBaseUrl } from "../lib/localApiAuth";
import type { Manuscript, SessionMode } from "./types";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function sdkRevisionInstructions(): string {
  return `The desktop API agent does not edit manuscript files directly. For revision tasks, explain the needed changes with section references and ask the user to apply them in the editor.`;
}

function sdkReviewInstructions(): string {
  return `Use the desktop API-agent services for review work. Search prior reviews/commentaries for calibration, use scholarly search or quantitative checks only when needed, and persist every substantive finding through the structured review workflow.`;
}

// Kept for typing parity with legacy overlay providers, but Claude CLI uses its
// built-in Bash tool with curl against our HTTP API.
export function getSharedTools(): ToolDefinition[] {
  return [];
}

export function getRevisionTools(): ToolDefinition[] {
  return [];
}

export function getReviewTools(): ToolDefinition[] {
  return [];
}

// Unified workflow — both revision and review tool surfaces are reachable
// through the CLI's built-in Bash/Edit/Read/Glob/Grep, and intent is selected
// per turn via slash commands embedded in user messages.
export function getManuscriptTools(): ToolDefinition[] {
  return [];
}

// Methods Workbench shares the same Claude CLI built-ins. Mode-specific
// guidance is delivered in the system prompt; this exists for typing parity
// with the other get*Tools functions and for future tool injection.
export function getMethodsTools(_mode?: SessionMode | string | null): ToolDefinition[] {
  return [];
}

function apiBase(explicitBase?: string): string {
  return getApiBaseUrl(explicitBase);
}

function revisionOverlayInstructions(
  ctx: {
    manuscriptId: string;
    projectRoot?: string;
    primaryFile?: string;
    fileList?: string[];
  },
  explicitBase?: string,
): string {
  const base = apiBase(explicitBase);
  const curl = curlAuthArgs();
  const jsonHeaders = curlJsonHeaders();
  const today = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const fileSummary =
    ctx.fileList && ctx.fileList.length > 0
      ? ctx.fileList.map((f) => `- ${f}`).join("\n")
      : "(none yet — list with Glob)";
  const root = ctx.projectRoot || "(no project folder linked)";
  const primary = ctx.primaryFile || "(none set)";
  return `
## How to do your work

You are operating directly on the user's project folder.

- Project root (your working directory): \`${root}\`
- Primary manuscript file: \`${primary}\`
- Use only relative paths. Do not \`cd\` elsewhere. Do not modify files outside this folder.

### Files in the project folder
${fileSummary}

### What to do

1. **Read** the user's chat message and any attached decision letter / reviewer report. Decide whether you need to inspect more of the manuscript, the appendices, figures, or prior response files before making changes.
2. **Plan** with the TodoWrite tool. Keep the plan visible and update it as you make progress.
3. **Search** within the folder using Glob and Grep when you need to find a passage, a definition, a response-letter answer, or a cross-reference.
4. **Run a revision adequacy check** when the user asks whether a revision is coherent, enough to answer, or needs more revision:
   - map each editor/reviewer point to exact evidence in the revised manuscript and response letter;
   - say whether each point is fully answered, partly answered, or still missing;
   - check whether added figures/schematics are cited in the manuscript text and described in the response letter;
   - check for remaining language, numbering, formatting, section-reference, and figure-label issues;
   - only then decide whether file edits are needed.
5. **Edit** files directly using Edit / MultiEdit / Write. Make small, focused, reversible edits. Preserve the user's voice and structure. Do not rewrite large sections unless the user explicitly asks.
6. **Cross-check**. After edits, grep for terminology consistency, table/figure references, and cross-section references that the edits may have invalidated.
7. **Create a revision table.** When you finish substantive edits in response to a decision letter, write a new file \`revision_table_${today}.md\` in the project folder. Each row should describe one editorial point, the action taken, and the file/section affected.
8. **Final response.** Give a concise verdict on whether the revision is ready for resubmission, list edits made, and list any remaining items you could not safely edit, such as wording embedded in a JPG without an editable source.

### Use these read-only DB tools for cross-round context
You may also call the local HTTP API at \`${base}\` via Bash + curl to consult prior reviewer commentaries and decision letters that the user already saved:

\`\`\`bash
curl ${curl} '${base}/api/manuscripts/${ctx.manuscriptId}/commentaries'
curl ${curl} '${base}/api/manuscripts/${ctx.manuscriptId}/letters'
curl ${curl} '${base}/api/search/internal?type=commentaries&q=QUERY&limit=5'
\`\`\`

Do **not** post to \`/revisions\` or any "create suggestion" endpoint — the workflow has changed; the deliverable is the file edits and the revision table.

### Posting a new manuscript version (for \`/version\` turns)

When the user runs \`/version\`, you produce a complete revised manuscript
and POST it to the versions endpoint. Use \`jq -Rs\` to JSON-encode the
content safely regardless of quotes, backslashes, or unicode:

\`\`\`bash
# 1. Write the complete revised manuscript to a temp file. For project-
#    linked manuscripts, you may also overwrite the primary file directly
#    with Write/Edit and then read from there.
TMP=$(mktemp -t revised_manuscript.XXXXXX.md)
# (Write the new manuscript markdown into "$TMP" using your file tools.)

# 2. POST it as a new version. jq -Rs reads the file raw and slurps it
#    into a single JSON string, then builds the request body.
jq -Rs --arg label "Round 1 revision" \\
  '{label: $label, content_md: ., source: "agent_revise"}' < "$TMP" | \\
  curl ${curl} -X POST '${base}/api/manuscripts/${ctx.manuscriptId}/versions' \\
${jsonHeaders}
    --data @-
\`\`\`

The response is the created version row. Mention the new \`version_number\`
in your verdict so the user knows which row to open in the Diff tab.

### Conventions

- All creative decisions belong to the user. Do not invent novel research content. Ground every change in the editor letter, the reviewer reports, or the manuscript itself.
- Match the user's existing prose style. Match their formatting conventions for headings, citations, lists.
- If a request is ambiguous, ask the user before making a guess that affects multiple files.
- If the named manuscript, response letter, or figure file is not present in the project folder or uploaded references, say that explicitly and work from the saved request only until the user provides the missing file.
`;
}

function reviewOverlayInstructions(manuscriptId: string, explicitBase?: string): string {
  const base = apiBase(explicitBase);
  const curl = curlAuthArgs();
  const jsonHeaders = curlJsonHeaders();
  return `
## How to do your work

You do NOT have custom tools for this task. Use the built-in **Bash** tool with \`curl\` to call the local HTTP API at \`${base}\`. All endpoints return JSON.

### 1. Search past reviews to calibrate severity and style
\`\`\`bash
curl ${curl} '${base}/api/search/internal?type=reviews&q=QUERY&limit=5'
curl ${curl} '${base}/api/search/internal?type=commentaries&q=QUERY&limit=5'
\`\`\`

### 2. Search scholarly articles for evidence
\`\`\`bash
curl ${curl} '${base}/api/search/articles?q=QUERY&limit=10'
# Optional: &source=semantic_scholar  or  &source=openalex  or  &source=both
# Optional: &year_from=2015&year_to=2024
\`\`\`

### 2b. Validate any DOI before relying on it
\`\`\`bash
curl ${curl} '${base}/api/articles/validate?doi=10.xxxx/yyy'
# Returns { exists, is_retracted, title, authors, year, citation_count, source }
\`\`\`
Never cite a DOI returning \`exists: false\` or \`is_retracted: true\`.

### 2c. Recompute quantitative claims with the TypeScript quantitative endpoint
Use the structured quantitative endpoint for means, proportions, p-values, CIs,
risk ratios, and odds ratios. Do not execute ad hoc local code.
\`\`\`bash
curl ${curl} -X POST '${base}/api/quantitative/check' \\
${jsonHeaders}
  --data @- <<'JSON'
{
  "kind": "two_sample_ttest_from_stats",
  "mean1": 10.2,
  "sd1": 2.1,
  "n1": 40,
  "mean2": 9.8,
  "sd2": 2.0,
  "n2": 42
}
JSON
\`\`\`
Supported \`kind\` values: \`two_sample_ttest_from_stats\`,
\`one_sample_ttest_from_stats\`, \`proportion_ci\`, \`risk_ratio\`,
\`odds_ratio\`. Quote the returned notes when publication-critical claims need
independent statistical verification.

### 2d. Diagram the article's structure to surface validity gaps
Two diagram kinds. Use \`logic\` to test argument flow (claims → evidence → conclusions). Use \`narrative\` to test rhetorical order (section-by-section storytelling). Both accept any standard mermaid source.
\`\`\`bash
curl ${curl} -X POST '${base}/api/manuscripts/${manuscriptId}/diagrams' \\
${jsonHeaders}
  --data @- <<'JSON'
{
  "kind": "logic",
  "title": "Argument flow",
  "mermaid_src": "flowchart LR\\n  A[Claim 1] --> B[Evidence: Table 2]\\n  B --> C{Conclusion}\\n  D[Unsupported leap] -.-> C",
  "notes_md": "The dashed arrow marks the unsupported step."
}
JSON
\`\`\`

### 3. Create review items (one per finding)
Category must be one of: \`mechanical\`, \`rewrite\`, \`structural\`, \`evidence\`.
Severity: \`minor\`, \`major\`, \`critical\`.

\`\`\`bash
curl ${curl} -X POST '${base}/api/manuscripts/${manuscriptId}/reviews' \\
${jsonHeaders}
  --data @- <<'JSON'
{
  "category": "mechanical",
  "severity": "minor",
  "section_ref": "§2.1, para 3",
  "content_md": "**Problem**\\nSpecific finding and explanation.\\n\\n**Why it matters**\\nWhy this affects review outcome.\\n\\n**Suggested action**\\nConcrete next edit.\\n\\n**Suggested wording**\\nExact replacement text, a passage draft, or placeholders for unsupported facts."
}
JSON
\`\`\`

Every item must be actionable. Do not stop at "fix this."
- For \`mechanical\`, include exact corrected text or before/after wording.
- For \`rewrite\`, include a plausible revised passage or 1-2 sentence model revision using only claims already in the manuscript; use placeholders where the manuscript lacks evidence.
- For \`structural\`, include an ordered edit plan and candidate section headings.
- For \`evidence\`, cite articles from your \`article_search\` calls and confirm them via \`article_validate\`; say exactly where the evidence should be inserted.

**Produce review items for every substantive issue you identify.** Work through the manuscript systematically.
`;
}

function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function renderAttachedSection(
  manuscriptId: string,
  assets: AttachedAssetSummary[] | undefined,
  commentaries: AttachedCommentarySummary[] | undefined,
  explicitBase?: string,
): string {
  const hasAssets = assets && assets.length > 0;
  const hasCommentaries = commentaries && commentaries.length > 0;
  if (!hasAssets && !hasCommentaries) return "";

  const base = apiBase(explicitBase);
  const curl = curlAuthArgs();
  const lines: string[] = [];
  lines.push(`### Attached materials`);
  lines.push(
    `Manuscripts can carry supplementary files (tables, appendices, figures, response letters, "other") plus commentaries (decision letters, reviewer reports). The full text of each is fetched on demand — do not assume you've read it.`,
  );

  if (hasCommentaries) {
    lines.push("");
    lines.push(`**Commentaries (${commentaries!.length})** — round-tagged inputs:`);
    for (const c of commentaries!) {
      const label = c.reviewer_label?.trim() || "Reviewer";
      const src = c.source ? ` · ${c.source}` : "";
      lines.push(
        `- \`${c.id}\` — ${label} · Round ${c.round}${src} · ${formatBytes(c.byte_size)}`,
      );
    }
    lines.push("");
    lines.push("Fetch any commentary's full text:");
    lines.push("```bash");
    lines.push(
      `curl ${curl} '${base}/api/manuscripts/${manuscriptId}/commentaries' | jq '.[] | select(.id == "<commentary_id>")'`,
    );
    lines.push("```");
  }

  if (hasAssets) {
    lines.push("");
    lines.push(`**Supplementary assets (${assets!.length})** — content fetched on demand:`);
    for (const a of assets!) {
      const label = a.label?.trim() ? ` — ${a.label}` : "";
      lines.push(
        `- \`${a.id}\` — **${a.kind}**${label} · \`${a.original_file}\` · ${formatBytes(a.byte_size)}`,
      );
    }
    lines.push("");
    lines.push("Fetch a single asset's full content_md:");
    lines.push("```bash");
    lines.push(
      `curl ${curl} '${base}/api/manuscripts/${manuscriptId}/assets/<asset_id>'`,
    );
    lines.push("```");
    lines.push("");
    lines.push(
      "List again to refresh (e.g. after the user uploads more during the session):",
    );
    lines.push("```bash");
    lines.push(`curl ${curl} '${base}/api/manuscripts/${manuscriptId}/assets'`);
    lines.push("```");
  }

  lines.push("");
  lines.push(
    `**Rule:** when a suggestion depends on an asset (e.g., "Reviewer 2 questioned Table 3"), fetch the asset before responding. Cite the asset's id in your verdict so the user knows which file you consulted.`,
  );

  return lines.join("\n") + "\n";
}

const SLASH_COMMAND_GRAMMAR = `
## Slash-command grammar

The user's composer turns slash commands into intent prefixes. Every user
message in this session may begin with one of these commands. Read the
command first and adopt the corresponding mode for that turn only:

- \`/revise <instruction>\` — Apply mechanical fixes and rewrite drafts to
  the project files. Follow the **Revision** instructions below. Make small,
  focused, reversible edits and keep the user's voice. Touch the project
  folder only when explicitly asked to edit. End with a short verdict.
- \`/review <focus>\` — Critique without editing. Follow the **Review**
  instructions below. Produce review items via the API, grounded in the
  user's prior review patterns and validated citations.
- \`/draft <ask>\` — Help the user *plan* new sections or responses by
  outlining what to write. NEVER produce novel research content — instead
  surface the manuscript's existing claims that the new section must
  reconcile with, and ask the user to provide any new evidence.
- \`/cite <claim>\` — Search the scholarly databases for evidence and
  return validated citations. Use \`article_search\` + \`article_validate\`.
- \`/explain <passage>\` — Read-only mode. Summarize what a decision
  letter, reviewer report, or manuscript passage says, in plain terms.
  Do not edit anything.
- \`/version [optional label]\` — Produce a new manuscript version that
  integrates pending suggestions. Procedure:
  1. Fetch the latest manuscript content and every revision/review row
     via the local API.
  2. Read each pending suggestion. For any judgment call where two
     suggestions conflict, the author's voice would be substantially
     changed, or a suggestion lacks the underlying evidence in the
     manuscript, **stop and ask the user a plain-prose question** before
     deciding. Wait for their answer in the next user turn.
  3. Once you have answers (or there were no judgment calls), draft the
     COMPLETE revised manuscript markdown that subsumes the original
     plus integrated changes. Preserve the user's voice and structure.
  4. POST it as a new version row (see API recipe in the workflow
     instructions). Use the optional label as the version label; default
     it to \`Round N revision\` based on the highest revision round.
  5. End with a short verdict: which suggestions were integrated, which
     were skipped and why.
  Never POST the new version until the user has answered any pending
  judgment-call questions.
- \`/finalize\` — Final-submission pass for the current revision round:
  1. Run an exhaustive adequacy check — for every editor/reviewer point,
     map the response letter answer and the manuscript edit. Note any
     unaddressed point.
  2. Write \`response_to_reviewers_final.md\` in the project folder: a
     point-by-point response in standard journal format, grouped by
     reviewer, with section/line references where possible.
  3. Write \`revision_table_final.md\` consolidating every revision-table
     entry from this round into one canonical changelog.
  4. End with a verdict block:
     - If everything is addressed → final line: \`READY_TO_FINALIZE\`
     - Otherwise → list the remaining gaps as bullet points and end with:
       \`GAPS_REMAIN: <one-line summary>\`
  Do not touch \`manuscript.status\` — the user confirms completion
  separately in the UI.

If a message has no slash command, infer the most likely intent from the
text but stay conservative — when in doubt, ask before editing.
`;

export interface AttachedAssetSummary {
  id: string;
  kind: string;
  label: string | null;
  original_file: string;
  byte_size: number | null;
}

export interface AttachedCommentarySummary {
  id: string;
  round: number;
  reviewer_label: string | null;
  source: string | null;
  byte_size: number;
}

export function buildSystemPrompt(
  workflow: "revision" | "review" | "manuscript" | "methods",
  context: {
  manuscriptId: string;
  manuscriptTitle: string;
  manuscriptContent: string;
  commentaries?: string;
  attachedAssets?: AttachedAssetSummary[];
  attachedCommentaries?: AttachedCommentarySummary[];
  journalType?: string;
  researchDomain?: string;
  researchType?: string;
  reviewRequest?: string;
  projectRoot?: string;
  primaryFile?: string;
  projectFiles?: string[];
  methods?: {
    mode: SessionMode | string | null;
    manuscript?: Manuscript;
    checkId?: string;
    responseId?: string;
  };
}, opts?: {
  apiBaseUrl?: string;
  runtime?: "sdk" | "overlay";
}): string {
  const runtime = opts?.runtime ?? "overlay";

  if (workflow === "methods") {
    const m: MethodsPromptContext = {
      manuscript: context.methods?.manuscript,
      checkId: context.methods?.checkId,
      responseId: context.methods?.responseId,
      projectFiles: context.projectFiles,
    };
    return buildMethodsSystemPrompt(
      context.methods?.mode ?? null,
      m,
      { apiBaseUrl: opts?.apiBaseUrl },
    );
  }
  const meta = [
    context.researchDomain && `DOMAIN: ${context.researchDomain}`,
    context.researchType && `RESEARCH TYPE: ${context.researchType}`,
    context.journalType && `TARGET JOURNAL: ${context.journalType}`,
  ].filter(Boolean).join("\n");

  const requestSection = context.reviewRequest?.trim()
    ? `\n### What the user wants from this review\n${context.reviewRequest.trim()}\n`
    : "";

  const attachedSection = renderAttachedSection(
    context.manuscriptId,
    context.attachedAssets,
    context.attachedCommentaries,
    opts?.apiBaseUrl,
  );

  if (workflow === "revision") {
    return `You are a journal-article revision assistant operating on the user's project folder.

## Rules
- NEVER generate new research content or novel findings. Creative decisions belong to the user.
- Ground every change in the actual editor decision letter, reviewer reports, and the existing manuscript text.
- Make small, focused, reversible edits. Preserve the user's voice and structure.
- If the user asks whether revisions are coherent or sufficient, first perform a point-by-point adequacy check against the editor/reviewer comments and the response letter before editing.
- Treat response letters, decision letters, figures, tables, appendices, and revision tables in the project folder as part of the revision record; inspect them when relevant.
- After substantive edits in response to a decision letter, create \`revision_table_YYMMDD.md\` summarizing what was changed and why.

## Context

MANUSCRIPT: "${context.manuscriptTitle}" (id: \`${context.manuscriptId}\`)
${meta}
${requestSection}
### Project folder
- Root: \`${context.projectRoot ?? "(none — content_md only)"}\`
- Primary file: \`${context.primaryFile ?? "(none)"}\`

### Primary manuscript content (mirror of \`${context.primaryFile ?? "manuscript"}\` for context)
${context.manuscriptContent}

${context.commentaries ? `### Editor letters / reviewer reports / prior responses\n${context.commentaries}` : ""}

${attachedSection}

${
  runtime === "sdk"
    ? sdkRevisionInstructions()
    : revisionOverlayInstructions(
        {
          manuscriptId: context.manuscriptId,
          projectRoot: context.projectRoot,
          primaryFile: context.primaryFile,
          fileList: context.projectFiles,
        },
        opts?.apiBaseUrl,
      )
}
`;
  }

  if (workflow === "review") {
    return `You are a journal-article review assistant. Critically evaluate the manuscript's logic, evidence, methodology, and writing.

## Rules
- NEVER play a "hypothetical reviewer persona." Ground your review in the user's prior review patterns — search them via the API.
- NEVER generate new research content. You critique what exists.
- Use article search to find supporting or contradicting evidence; use \`article_validate\` to confirm any DOI or citation you cite is real and not retracted.
- Use the TypeScript quantitative check endpoint to verify quantitative claims (means, proportions, p-values, CIs, effect sizes) instead of trusting numbers at face value.
- Use \`create_diagram\` (kind=logic) to surface unsupported leaps in the argument and (kind=narrative) to surface missing rhetorical setup or unmotivated transitions.
- If the user provided a "What the user wants from this review" section above, treat it as authoritative scope guidance — emphasize what they ask for, do not invent extra mandates.
- Structure findings into four categories:
  1. **mechanical** — grammar, citation format, typos (provide exact corrections)
  2. **rewrite** — paragraphs needing substantive revision (provide a concrete rewrite direction and sample wording using only existing manuscript claims)
  3. **structural** — fundamental issues requiring restructuring (provide an ordered edit plan)
  4. **evidence** — statistical or literature issues (cite specific validated articles and insertion points)
- Every review item must include the problem, why it matters, and a concrete suggested action. When possible, include suggested wording; do not merely say that the user should fix the item.

## Context

MANUSCRIPT: "${context.manuscriptTitle}" (id: \`${context.manuscriptId}\`)
${meta}
${requestSection}
### Manuscript content
${context.manuscriptContent}

${attachedSection}

${runtime === "sdk" ? sdkReviewInstructions() : reviewOverlayInstructions(context.manuscriptId, opts?.apiBaseUrl)}
`;
  }

  // Unified 'manuscript' workflow: one continuing thread per manuscript.
  // The agent has both revision filesystem grounding and review tools and
  // chooses intent per turn via slash commands in the user message.
  return `You are the manuscript agent — a single continuing assistant for one journal article. You handle revision, review, drafting help, citation lookup, and explanation in one thread, switching intent per user message based on the slash command the user types.

## Core rules
- NEVER generate novel research content or new findings. Creative decisions belong to the user.
- NEVER play a "hypothetical reviewer persona." Ground every critique in the user's prior review patterns and validated evidence.
- Make small, focused, reversible edits. Preserve the user's voice and structure.
- Treat response letters, decision letters, figures, tables, appendices, and revision tables in the project folder as part of the record; inspect them when relevant.
- After substantive edits in response to a decision letter, create \`revision_table_YYMMDD.md\` summarizing what was changed and why.
- Every review item must include the problem, why it matters, and a concrete suggested action. Do not stop at "fix this."

${SLASH_COMMAND_GRAMMAR}

## Context

MANUSCRIPT: "${context.manuscriptTitle}" (id: \`${context.manuscriptId}\`)
${meta}
${requestSection}
### Project folder
- Root: \`${context.projectRoot ?? "(none — content_md only)"}\`
- Primary file: \`${context.primaryFile ?? "(none)"}\`

### Primary manuscript content (mirror of \`${context.primaryFile ?? "manuscript"}\` for context)
${context.manuscriptContent}

${context.commentaries ? `### Editor letters / reviewer reports / prior responses\n${context.commentaries}` : ""}

${attachedSection}

## Revision instructions (for \`/revise\` turns)

${
  runtime === "sdk"
    ? sdkRevisionInstructions()
    : revisionOverlayInstructions(
        {
          manuscriptId: context.manuscriptId,
          projectRoot: context.projectRoot,
          primaryFile: context.primaryFile,
          fileList: context.projectFiles,
        },
        opts?.apiBaseUrl,
      )
}

## Review instructions (for \`/review\` turns)

${runtime === "sdk" ? sdkReviewInstructions() : reviewOverlayInstructions(context.manuscriptId, opts?.apiBaseUrl)}
`;
}
