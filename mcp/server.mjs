#!/usr/bin/env node
// ===========================================================================
// reviewer-agent-mcp — an MCP (stdio) server that lets Claude Code / Codex drive
// the Reviewer-Agent desktop app. It holds no business logic: every tool is a
// thin wrapper over an existing /api/studies/* route on the locally-running app
// (HTTP bridge). Configure with REVIEWER_API_URL (default http://localhost:3871)
// and REVIEWER_APP_TOKEN (must match the app process). See docs/MCP.md.
// ===========================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiJson, apiText, apiUpload, BASE } from "./client.mjs";

const STUDY_MODES = [
  "scoping_review",
  "systematic_review",
  "retrospective_observational",
  "interventional",
];

const DRAFT_SECTIONS = [
  "outline",
  "introduction",
  "methodology",
  "results",
  "discussion",
  "abstract",
];

const server = new McpServer({
  name: "reviewer-agent",
  version: "0.1.0",
});

/** Wrap a handler so thrown errors become MCP error results, not crashes. */
function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return await handler(args ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
    }
  });
}

const json = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const text = (s) => ({ content: [{ type: "text", text: s }] });

// ---------------------------------------------------------------------------
// Studies
// ---------------------------------------------------------------------------

tool(
  "list_studies",
  {
    title: "List studies",
    description:
      "List Methods Workbench studies (id, title, mode, status). Use this to find an existing study's id (st_…) before importing or drafting.",
    inputSchema: {
      mode: z.enum(STUDY_MODES).optional().describe("filter by study mode"),
      status: z
        .enum(["draft", "active", "archived"])
        .optional()
        .describe("filter by status"),
    },
  },
  async ({ mode, status }) => {
    const qs = new URLSearchParams();
    if (mode) qs.set("mode", mode);
    if (status) qs.set("status", status);
    const studies = await apiJson(`/api/studies?${qs.toString()}`);
    return json(studies);
  },
);

tool(
  "create_study",
  {
    title: "Create study",
    description:
      "Create a new Methods Workbench study. For a literature review, use mode 'scoping_review' (default) or 'systematic_review'. Returns the new study including its id (st_…).",
    inputSchema: {
      title: z.string().min(1).describe("study / review title"),
      mode: z.enum(STUDY_MODES).default("scoping_review"),
      research_question: z.string().optional(),
    },
  },
  async ({ title, mode, research_question }) => {
    const study = await apiJson(`/api/studies`, {
      method: "POST",
      body: { title, mode: mode ?? "scoping_review", research_question },
    });
    return json(study);
  },
);

// ---------------------------------------------------------------------------
// Corpus: import, overview, export
// ---------------------------------------------------------------------------

tool(
  "import_review_csv",
  {
    title: "Import review CSV(s)",
    description:
      "Import one or more local CSV files into a study's corpus. The shape of each file is auto-detected: a search-process CSV (RQ/PCC + per-database queries and yields) fills the design cards and PRISMA identification count; a records CSV (record_id,title,…,decision) loads the screened records. Pass both at once to set up a scoping review end-to-end.",
    inputSchema: {
      study_id: z.string().describe("target study id (st_…)"),
      paths: z
        .array(z.string())
        .min(1)
        .describe("absolute or relative paths to the CSV file(s) on disk"),
      kind: z
        .enum(["search", "records"])
        .optional()
        .describe("force the import shape instead of auto-detecting"),
    },
  },
  async ({ study_id, paths, kind }) => {
    const files = await Promise.all(
      paths.map(async (p) => ({
        name: path.basename(p),
        data: await readFile(p),
      })),
    );
    const result = await apiUpload(
      `/api/studies/${study_id}/import`,
      files,
      kind ? { kind } : {},
    );
    return json(result);
  },
);

tool(
  "corpus_overview",
  {
    title: "Corpus overview",
    description:
      "Return the PRISMA-ScR flow counts, per-database search yields, and screening statistics (include/exclude/maybe/unscreened, confirmed, needs-review) for a study. Use this to confirm the corpus state before drafting.",
    inputSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  async ({ study_id }) => {
    const [prisma, records] = await Promise.all([
      apiJson(`/api/studies/${study_id}/prisma`),
      apiJson(`/api/studies/${study_id}/records?limit=1`),
    ]);
    return json({
      flow: prisma?.flow ?? null,
      searches: prisma?.searches ?? [],
      stats: records?.stats ?? null,
      prisma_markdown: prisma?.markdown ?? null,
    });
  },
);

tool(
  "export_corpus",
  {
    title: "Export corpus",
    description:
      "Export the corpus as text. view='records' (default) returns the round-trip CSV of every record + its decision; view='characteristics' returns the characteristics-of-included-sources table (csv or md).",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      view: z.enum(["records", "characteristics"]).default("records"),
      format: z.enum(["csv", "md"]).default("csv"),
    },
  },
  async ({ study_id, view, format }) => {
    const qs = new URLSearchParams({
      view: view ?? "records",
      format: format ?? "csv",
    });
    const body = await apiText(
      `/api/studies/${study_id}/records/export?${qs.toString()}`,
    );
    return text(body);
  },
);

// ---------------------------------------------------------------------------
// Drafting harness — the headline tool
// ---------------------------------------------------------------------------

tool(
  "build_drafting_brief",
  {
    title: "Build drafting brief / AGENTS.md",
    description:
      "Compile a self-contained drafting brief from a study's recorded design and (for reviews) its screened corpus + PRISMA flow. Choose any IMRaD sections (outline/introduction/methodology/results/discussion/abstract) and/or pass a freeform task. Returns an AGENTS.md you can save, a combined prompt, and per-section prompts. Every prompt instructs the model to use ONLY the recorded material and never invent findings. This is the tool to use for requests like 'create an AGENTS.md for writing the results and discussion'.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      sections: z
        .array(z.enum(DRAFT_SECTIONS))
        .optional()
        .describe("sections to include; omit for the per-mode default set"),
      task: z
        .string()
        .optional()
        .describe("a freeform drafting instruction to wrap with the grounding"),
    },
  },
  async ({ study_id, sections, task }) => {
    const data = await apiJson(`/api/studies/${study_id}/drafting-prompts`, {
      method: "POST",
      body: { sections, task },
    });
    // Lead with the ready-to-use file/prompt; include the structured forms after.
    const primary = data.freeformPrompt || data.agentsMd;
    return {
      content: [
        { type: "text", text: primary },
        {
          type: "text",
          text: JSON.stringify(
            {
              sections: data.sections,
              hasDesign: data.hasDesign,
              hasCorpus: data.hasCorpus,
              taskPrompts: data.taskPrompts,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Intake & give-and-take. The CONVERSATION is the calling agent's job — it asks
// the author (e.g. via its own AskUserQuestion tool) and reasons. These tools
// give it the material (current design, computed gaps, guideline coverage) and
// the write path (record the author's answers). Per the app's hard rule the
// agent must NEVER invent research content; it elicits the author's own
// decisions and records them. The `methods_intake` prompt scaffolds the loop.
// ---------------------------------------------------------------------------

const CARD_STATES = [
  "not_started",
  "drafted",
  "underspecified",
  "conflicting",
  "evidence_supported",
  "needs_input",
  "unknown",
  "assumed",
  "locked",
];

tool(
  "get_design",
  {
    title: "Get study design",
    description:
      "Read the study's decision cards — for each: type, label, state, the fields it requires, the author's current values, any recorded open question, and the help text. Use this to see what is recorded and what each card still needs before asking the author.",
    inputSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  async ({ study_id }) => {
    const data = await apiJson(`/api/studies/${study_id}/cards`);
    const cards = (data.cards ?? []).map((c) => ({
      card_type: c.card_type,
      label: c.label,
      state: c.state,
      stale: c.stale,
      required_fields: (c.requiredFields ?? []).map((f) => f.id),
      value: c.value,
      open_question_md: c.open_question_md ?? null,
      help: c.help,
    }));
    return json({ study: data.study, cards });
  },
);

tool(
  "analyze_gaps",
  {
    title: "Analyze gaps & needs",
    description:
      "Run the deterministic preflight inspector: completeness/consistency findings, recorded risk findings, reporting-guideline coverage counts, overall readiness %, and the single next-best action. This is the 'what's missing / what's wrong / what to do next' analysis — surface it to the author and turn each finding into a question. No content is invented.",
    inputSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  async ({ study_id }) => {
    const v = await apiJson(`/api/studies/${study_id}/preflight`);
    return json({
      readyPct: v.readyPct,
      blockingCount: v.blockingCount,
      importantCount: v.importantCount,
      nextBestAction: v.nextBestAction,
      nextBestActionCard: v.nextBestActionCard,
      staleCards: v.staleCards,
      findings: v.findings,
      riskFindings: v.riskFindings,
      guidelineCoverage: v.mapping,
    });
  },
);

tool(
  "checklist_coverage",
  {
    title: "Reporting-guideline checklist coverage",
    description:
      "Return the compiled reporting-guideline checklist map (e.g. PRISMA-ScR): each item with whether it is covered and which design cards feed it. Use the uncovered items to drive questions to the author about the guideline — do not fill them in yourself.",
    inputSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  async ({ study_id }) => {
    const data = await apiJson(
      `/api/studies/${study_id}/artifacts/checklist_map`,
    );
    const sections = (data.compiled?.sections ?? []).map((s) => ({
      item: s.heading,
      covered: s.ready,
      source_cards: s.source_cards,
      body_md: s.body_md,
    }));
    return json({
      title: data.compiled?.title,
      ready_pct: data.compiled?.ready_pct,
      uncovered: sections.filter((s) => !s.covered).map((s) => s.item),
      sections,
    });
  },
);

tool(
  "update_card",
  {
    title: "Update a design card",
    description:
      "Record the AUTHOR'S decision on one design card. Write only content the author has provided or confirmed — never invent research substance. Set `state` to reflect reality (e.g. 'drafted' once filled, 'needs_input' when still open). Use `open_question_md` to park something the author wants to revisit, and `reason_md` to capture their rationale.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      card_type: z
        .string()
        .describe("card type, e.g. review_question, eligibility_criteria"),
      value: z.string().optional().describe("free-text value for the card"),
      fields: z
        .record(z.string(), z.string())
        .optional()
        .describe("structured field values, keyed by required-field id"),
      state: z.enum(CARD_STATES).optional(),
      open_question_md: z.string().nullable().optional(),
      reason_md: z.string().nullable().optional(),
    },
  },
  async ({ study_id, card_type, ...patch }) => {
    const updated = await apiJson(
      `/api/studies/${study_id}/cards/${card_type}`,
      { method: "PATCH", body: patch },
    );
    return json(updated);
  },
);

tool(
  "update_study",
  {
    title: "Update study fields",
    description:
      "Update the study's title, research question, or status. Use this to record the author's research question once they have stated or confirmed it.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      title: z.string().optional(),
      research_question: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
    },
  },
  async ({ study_id, ...patch }) => {
    const updated = await apiJson(`/api/studies/${study_id}`, {
      method: "PATCH",
      body: patch,
    });
    return json(updated);
  },
);

tool(
  "record_gap",
  {
    title: "Record a gap / need as a finding",
    description:
      "Persist a gap or need so it shows up in the app's Preflight Inspector for the author. Use this for issues the author wants to track rather than resolve now (e.g. a missing protocol registration, an unresolved eligibility ambiguity). Title states the gap; detail_md explains it.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      title: z.string().describe("short statement of the gap/need"),
      severity: z.enum(["blocking", "important", "minor"]).default("important"),
      card_type: z.string().optional().describe("related card, if any"),
      detail_md: z.string().optional(),
      layer: z
        .enum(["completeness", "consistency", "risk"])
        .default("completeness"),
    },
  },
  async ({ study_id, ...finding }) => {
    const created = await apiJson(
      `/api/studies/${study_id}/preflight/findings`,
      { method: "POST", body: finding },
    );
    return json(created);
  },
);

tool(
  "list_records",
  {
    title: "List screened records",
    description:
      "List records in the corpus with their internal id (rc_…), decision, imported screen tier/reason/confidence and abstract. Filter to drive the screening review (e.g. needs_review=true, or decision='unscreened'). Use the returned `id` with set_record_decision.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      decision: z.enum(["include", "exclude", "maybe", "unscreened"]).optional(),
      tier: z.string().optional(),
      confidence: z.string().optional(),
      needs_review: z.boolean().optional(),
      q: z.string().optional().describe("free-text filter over title/abstract"),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
  },
  async ({ study_id, ...f }) => {
    const qs = new URLSearchParams();
    if (f.decision) qs.set("decision", f.decision);
    if (f.tier) qs.set("tier", f.tier);
    if (f.confidence) qs.set("confidence", f.confidence);
    if (f.needs_review) qs.set("needs_review", "1");
    if (f.q) qs.set("q", f.q);
    qs.set("limit", String(f.limit ?? 25));
    if (f.offset) qs.set("offset", String(f.offset));
    const data = await apiJson(`/api/studies/${study_id}/records?${qs}`);
    const records = (data.records ?? []).map((r) => ({
      id: r.id,
      external_id: r.external_id,
      title: r.title,
      authors: r.authors,
      year: r.year,
      decision: r.decision,
      screen_tier: r.screen_tier,
      screen_reason: r.screen_reason,
      screen_confidence: r.screen_confidence,
      needs_review: r.needs_review,
      user_confirmed: r.user_confirmed,
      abstract: r.abstract,
    }));
    return json({ total: data.total, stats: data.stats, records });
  },
);

tool(
  "set_record_decision",
  {
    title: "Set a record's screening decision",
    description:
      "Record the AUTHOR'S screening decision on one record (by internal id rc_…). Use only the decision the author gave — do not re-screen or decide for them. Set user_confirmed=true once they confirm it.",
    inputSchema: {
      study_id: z.string().describe("study id (st_…)"),
      record_id: z.string().describe("internal record id (rc_…) from list_records"),
      decision: z.enum(["include", "exclude", "maybe", "unscreened"]),
      decision_reason: z.string().nullable().optional(),
      user_confirmed: z.boolean().optional(),
    },
  },
  async ({ study_id, record_id, ...patch }) => {
    const updated = await apiJson(
      `/api/studies/${study_id}/records/${record_id}`,
      { method: "PATCH", body: patch },
    );
    return json(updated);
  },
);

// ---------------------------------------------------------------------------
// Prompts — reusable playbooks the calling agent can load (Claude Code surfaces
// these as slash commands). They encode the give-and-take loop and the hard
// no-invent rule so the agent runs the intake consistently.
// ---------------------------------------------------------------------------

const NO_INVENT =
  "Follow the app's hard rule: NEVER invent research content — questions, eligibility criteria, methods, counts, findings, or citations. Elicit the author's own decisions and record them. If the author cannot answer, leave it as an explicit open question rather than filling it in.";

server.registerPrompt(
  "methods_intake",
  {
    title: "Methods intake review (give-and-take)",
    description:
      "Run a back-and-forth review of a study design: read the recorded design, surface gaps and uncovered guideline items, ask the author, and record their answers.",
    argsSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  ({ study_id }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `Run a methods-intake review for Reviewer-Agent study ${study_id} using the reviewer-agent MCP tools. You facilitate; the author decides. ${NO_INVENT}`,
            "",
            "Loop until the design is as complete as the author can make it:",
            "1. Read state: call `get_design` and `analyze_gaps` (and `checklist_coverage` for reporting-guideline items).",
            "2. Summarise for the author: what is recorded, what is missing / underspecified / conflicting / stale, and which guideline items are not yet covered. Lead with `analyze_gaps.nextBestAction` and any blocking findings.",
            "3. For each gap, ask the author a focused question — use your own AskUserQuestion tool when available, otherwise ask in plain text. Offer options framed as questions, drawn only from what they already provided or standard methodological choices; do not assert an answer. You may point out inconsistencies in content they already wrote and propose a normalisation for their confirmation.",
            "4. Record their answer with `update_card` (value/fields/state/open_question_md/reason_md) or `update_study` (research_question). Set `state` to reflect reality. Park anything to revisit with `open_question_md` or `record_gap`.",
            "5. Re-run `analyze_gaps` and repeat. Finish with a short status: readyPct, remaining open questions, and uncovered guideline items.",
          ].join("\n"),
        },
      },
    ],
  }),
);

server.registerPrompt(
  "screening_review",
  {
    title: "Screening review (confirm imported decisions)",
    description:
      "Walk the author through the records the imported AI screening flagged for review, and record their confirmed decisions.",
    argsSchema: { study_id: z.string().describe("study id (st_…)") },
  },
  ({ study_id }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `Help the author finalise screening for Reviewer-Agent study ${study_id} using the reviewer-agent MCP tools. ${NO_INVENT} The imported screening decisions are the author's own AI-assisted output; your job is to help them confirm or change each, not to re-screen.`,
            "",
            "1. Call `corpus_overview` to report totals (included/excluded/maybe/unscreened, confirmed, needs-review) and the PRISMA flow.",
            "2. Call `list_records` with needs_review=true (then decision='unscreened') to fetch the records that need the author's attention. Present each with its title, abstract, and the imported screen reason.",
            "3. Ask the author for the decision on each (include / exclude / maybe), and why if they wish — do not decide for them.",
            "4. Record each answer with `set_record_decision` (use the record's internal id, set user_confirmed=true). Re-check with `corpus_overview` and summarise what still needs the author's confirmation.",
          ].join("\n"),
        },
      },
    ],
  }),
);

// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for diagnostics; stdout is the MCP channel.
  console.error(`reviewer-agent-mcp connected → ${BASE}`);
}

main().catch((err) => {
  console.error("reviewer-agent-mcp failed to start:", err);
  process.exit(1);
});
