# reviewer-agent

Reviewer Agent is a local-first desktop workspace for researchers who want to
keep study design, manuscript drafting, peer-review response, and readiness
checks in one traceable place. It is built around a simple direction of work:
start upstream in Methods Workbench, make the study decisions explicit, compile
the protocol/SAP/checklist artifacts, create a linked article draft, then
continue in My Articles for manuscript review, readiness checks, revisions, and
reviewer-response drafting.

The app is meant to be an editorial and methods workbench, not an autonomous
paper writer. It helps organize decisions, surface inconsistencies, draft
structured text, and run LLM-assisted checks against the materials you provide.
Novel claims, study design choices, statistical judgments, citations, and final
manuscript edits remain the user's responsibility.

Reviewer Agent can run against cloud or local API providers, including
OpenAI-compatible endpoints, Ollama, LM Studio, and llama-server. Data is stored
locally by default, while provider calls only happen when you configure a
provider and run an LLM-backed action.

Korean guide: [`i18n/korean/README.md`](i18n/korean/README.md)

## Status

This is a pre-0.1.0 closed-beta research-assistance app. The only distributed
binary for this prerelease is the Windows x64 portable `.exe` attached to the
`v0.1.0-beta.0` GitHub prerelease.

Use it as an editorial and methods-checking workspace, not as medical, legal,
regulatory, or statistical advice. Verify all LLM output, citations,
calculations, and manuscript changes before relying on them.

## Privacy Model

The app stores data locally in SQLite and markdown exports. Cloud providers
receive manuscript or reviewer content only when you configure and use a cloud
API provider. Do not send PHI, PII, embargoed manuscripts, or confidential peer
review material to a cloud provider unless you have the right to do so.

The Electron desktop app binds its server to `127.0.0.1` and protects local
`/api/*` requests with a short-lived app token injected by the Electron main
process. `npm run start:server` runs the same app headless on loopback; set
`REVIEWER_APP_TOKEN` to authenticate `/api/*` (required when an MCP client or
anything else can reach the port). Direct `npm run dev` / `npm run start` is
developer browser mode; do not expose any of these to a network.

## Workspaces

### Methods Workbench

Build and audit study-method artifacts before and during manuscript
preparation:

- protocol creation and protocol audit
- SAP drafting
- data dictionary editing/import/export
- reporting checklist setup
- scoping reviews — import the search-process and screened-record CSVs, confirm
  the imported screening decisions, and compile PRISMA-ScR flow counts, the
  PRISMA-ScR checklist, a characteristics-of-sources table, and a round-trip CSV
- drafting prompts — generate self-contained prompts for drafting any article
  section (outline, introduction, methodology, and — for reviews — results and
  discussion grounded in the screened corpus and PRISMA flow) from the recorded
  design (beside "Create Article Draft")
- manuscript-readiness checks linked to My Articles

A first-run setup panel and an in-canvas guide orient newcomers, and technical
terms carry plain-language explanations on hover, so a researcher without a
software background can work the canvas unaided.

### My Articles

Upload your own manuscript and use the agent for:

- revision from reviewer commentaries
- pre-submission manuscript review
- manuscript readiness checks
- reviewer-response drafting
- revision harness — turn a reconciled readiness check into a self-contained
  prompt set that drives any AI (browser chat or CLI agent) to revise the
  manuscript and close the accepted findings

## Step-by-step App Flow

### 1. Configure API providers

Open `Settings` -> `API Providers`.

Set the default provider, model, API key, and base URL. These settings power
real LLM-backed actions such as manuscript review, readiness checks, reviewer
responses, and manuscript chat.

The Settings page and the Methods Workbench setup panel show a live status for
every provider — what is reachable, what is missing an API key, and the exact
step to fix it — so configuration problems surface immediately instead of after
a long timeout. The same check is available at `GET /api/providers/health`.

Use `Settings` -> `Language` to switch the app shell and settings pane between
English and Korean.

### 2. Start in Methods Workbench

Open `Methods Workbench`.

Use either:

- `Seed Methods Demo` to create a ready systematic-review demo study.
- `+ Start a study` to create your own study design.

The Methods Workbench is the upstream planning layer for the research question,
eligibility criteria, intervention or exposure, outcomes, analysis plan, and
reporting checklist.

### 3. Work the Methods study

Inside a study:

1. Fill the decision cards. Ask for evidence-grounded options whenever you are
   unsure — the assistant proposes, you decide.
2. Add evidence — paste plain background notes (the assistant extracts evidence
   items such as populations, outcomes, and confounders) or import a structured
   snapshot.
3. Use proposal and preflight actions to identify missing or inconsistent
   design choices.
4. Review generated artifacts:
   - protocol
   - SAP
   - data dictionary
   - reporting checklist map
   - PROSPERO or registration fields

### 4. Create the article draft

From the Methods study header, click `Create Article Draft`.

This creates a linked article in `My Articles` from the Methods decisions. It
also attaches the compiled Methods artifacts as manuscript appendices. Repeated
clicks reopen the existing linked article instead of creating duplicates.

Next to this button, `Drafting prompts` compiles ready-to-use, self-contained
prompts for drafting any article section — outline, introduction, methodology,
and, for review studies, results and discussion grounded in the screened corpus
and PRISMA flow. Copy a combined or per-section prompt into any browser-based AI,
or download `AGENTS.md` / `drafting-prompts.md` for an agentic tool. The prompts
draft only from your recorded decisions and instruct the AI not to invent.

### 5. Continue in My Articles

Open the generated article workspace.

The article includes:

- a structured manuscript draft
- a `Source methods` link back to the originating Methods study
- attached Methods artifacts
- the manuscript chat/workspace for LLM-driven review and editing

### 6. Run readiness

In the article workspace, click `Readiness`.

If the article was created from Methods Workbench, readiness automatically
compares the manuscript against the originating study design. Use this to catch
drift such as outcome timepoint mismatches, missing eligibility criteria,
missing reporting checklist items, or claims not supported by the protocol.

After reconciling the findings (accept the ones you will fix, dismiss the rest),
use `Generate revision harness` to compile a self-contained prompt that drives an
AI to revise the manuscript and close the accepted findings — making small,
focused, reversible edits, giving revised text with section pointers, and ending
with a revision table. You get one holistic prompt plus a per-finding prompt for
each accepted finding. Copy into any browser-based AI, or download `AGENTS.md` /
`revision-harness.md` for an agentic tool. It is grounded only in your manuscript
and findings and instructs the AI not to invent.

### 7. Add reviewer material

Upload a decision letter or reviewer reports in the article flow.

Then use:

- `Reviewer response` to draft point-by-point replies.
- manuscript chat commands to revise, review, explain, finalize, and continue
  the draft.

### 8. Use the app-level demo

On the dashboard, `Load Demo Set` runs the broader end-to-end demo:

1. seeds a Methods study
2. seeds a manuscript
3. runs real API-backed preflight, review, readiness, and reviewer-response
   workflows

Use this when you want to verify the full app stack with your configured
provider.

The main workflow is:

```text
Methods Workbench -> Create Article Draft -> My Articles -> Readiness / Review / Response / Finalize
```

## MCP server (Claude Code / Codex)

Reviewer Agent ships an MCP server (`mcp/server.mjs`) that lets a CLI agent such
as Claude Code or Codex drive the app. It is a stdio bridge to the app's local
REST API — no business logic of its own — and exposes tools to find/create a
study, import the scoping-review CSVs by path, inspect the corpus and PRISMA
flow, and build a self-contained drafting brief / `AGENTS.md` for any section.

It also exposes an **intake give-and-take**: tools to read the recorded design,
surface gaps and uncovered reporting-guideline items, and record the author's
answers, plus `methods_intake` / `screening_review` prompts that walk the agent
through the back-and-forth. The agent facilitates and the author decides — it
never invents research content.

Run the app headless first, then point the MCP server at it:

```bash
npm run build
export REVIEWER_APP_TOKEN=$(openssl rand -hex 32)   # authenticates /api/*
npm run start:server                                 # binds 127.0.0.1
```

See [`docs/MCP.md`](docs/MCP.md) for the headless runbook and the Claude Code /
Codex registration snippets. The headless server is local-only; keep it on
loopback and set `REVIEWER_APP_TOKEN` so `/api/*` is authenticated.

## Quick Start

```bash
nvm use
npm install --include=dev
npm run dev
```

Open `http://localhost:3871`.

## Scripts

```bash
npm run dev
npm run build
npm run start:server   # headless production server bound to 127.0.0.1
npm run mcp            # MCP stdio server (bridges to a running app)
npm run typecheck
npm run lint
npm test
npm run desktop:dist:win
```

## Data

SQLite data and markdown exports are stored under `REVIEWER_DATA_DIR`, defaulting
to `./data`.

## Security

See [`SECURITY.md`](SECURITY.md) for the local app security model and reporting
process.
