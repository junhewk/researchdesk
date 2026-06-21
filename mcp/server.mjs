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
