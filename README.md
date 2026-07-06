# ResearchDesk

ResearchDesk is a local-first prompt harness for scholarly article work. It
keeps study design, article-drafting prompts, peer-review response, and
readiness checks in one traceable place. It is built around a simple direction
of work: start upstream in Methods Workbench, make the study decisions explicit,
compile the protocol/SAP/checklist artifacts, create a linked article draft,
then continue in My Articles for manuscript review, readiness checks, revisions,
and reviewer-response drafting.

The app is not a word processor and not an autonomous paper writer. Its main
job is to turn recorded methods, uploaded article material, and resolved review
findings into controlled prompts and harnesses that help you use an AI system
without inventing research content. Novel claims, study design choices,
statistical judgments, citations, and final manuscript edits remain the user's
responsibility.

ResearchDesk can run against cloud or local API providers, including OpenAI,
Codex with ChatGPT login, OpenAI-compatible endpoints, Ollama, LM Studio, and
llama-server. Local llama-server / LM Studio endpoints are driven with
grammar-constrained (JSON-schema) decoding, so small local models such as Qwen3
return reliable structured output. Data is stored locally by default, while
provider calls only happen when you configure a provider and run an LLM-backed
action.

Korean guide: [`i18n/korean/README.md`](i18n/korean/README.md)

## Status

This is the `v0.1.4` release of a research-assistance app. The distributed
desktop artifacts are the Windows x64 portable `.exe` from GitHub Actions and
the local macOS arm64 build in `dist/mac-arm64/ResearchDesk.app`. Headless MCP
bundles are published separately as `ResearchDesk-Headless-*` artifacts for
Linux x64, Windows x64, and macOS arm64.

Use it as an editorial and methods-checking workspace, not as medical, legal,
regulatory, or statistical advice. Verify all LLM output, citations,
calculations, and manuscript changes before relying on them.

So far the app has been tested primarily against **scoping- and
systematic-review** research. The other study modes (retrospective
observational and interventional/trial) are supported but not yet fully
validated — expect updates and validation for those workflows soon.

## What's new in v0.1.4

- **Codex as a first-class model provider.** The API Providers screen now
  includes Codex with app-scoped ChatGPT browser sign-in, so users can run
  ResearchDesk agents through Codex without saving an OpenAI API key.
- **Bundled Codex runtime for desktop.** Desktop packaging now includes the
  platform Codex native runtime and audits the expected binary, while allowing
  the larger app payload that comes with the Codex bundle. Headless MCP bundles
  intentionally omit the native Codex runtime because Codex is the MCP client
  in that flow, not an embedded ResearchDesk model provider.
- **Codex-aware provider health.** Provider status now reports bundled runtime
  availability and ChatGPT auth state instead of treating Codex like an API-key
  provider.
- **Codex auth state stays local.** The app stores the Codex auth cache under
  the ResearchDesk data directory and ignores those local runtime files in git.

## What's new in v0.1.3

- **Renamed and repositioned as ResearchDesk.** The app now foregrounds its main
  role as a local-first AI prompt harness for scholarly article work, while
  preserving the Methods Workbench → article → review/response flow.
- **New canonical repository.** Future releases are published from
  [`junhewk/researchdesk`](https://github.com/junhewk/researchdesk) after the
  GitHub repository rename.
- **Bundled headless + MCP runtime.** Release builds now include separate
  headless artifacts with the app server, MCP bridge, wrapper CLI, and embedded
  Node runtime so users can run MCP without `nvm`, `npx`, global Node, or raw
  checkout paths.
- **Button-driven article agent UX.** Manuscript review, version creation,
  readiness, reviewer response, and finalization are launched from explicit
  workflow buttons instead of a visible chat/composer surface.
- **Desktop packaging is smaller and runnable.** The macOS arm64 package now
  stages the Next/Turbopack server runtimes it needs at startup while keeping
  the packaged app payload near 51 MB.
- **Research Projects shell.** Bench/setup and article/review records now live
  under a unified Projects view with Archives and Support routes, preserving
  existing app-support data paths so previous records continue to appear.
- **Release workflow no longer targets Intel macOS.** v0.1.3 publishes
  headless bundles for Linux x64, Windows x64, and macOS arm64 only.
- **Compatibility preserved.** Existing `REVIEWER_*` environment variables, the
  old `x-reviewer-app-token` header, the `reviewer-agent-mcp` bin alias, and old
  desktop data locations remain supported while new `RESEARCHDESK_*` names are
  preferred.

## What's new in v0.1.2

- **MCP server aligned with the v0.1.1 app surface.** The `mcp/server.mjs`
  bridge now exposes the workbench→article workflow to CLI agents (Claude Code /
  Codex): `promote_study_to_article` (the Create Article Draft step) with
  `list_promotable_studies`, an approve-before-apply CSV import
  (`preview_csv_import` → author-approved column mapping → `apply_csv_import`,
  with the `csv_import_review` prompt), and `set_study_confidentiality` to toggle
  `local_only`, which pins the study's LLM calls and any promoted article to
  local providers.
- **Version no longer drifts.** The MCP server reads its version from
  `package.json` at startup instead of a hardcoded literal, and the
  `review_manuscript` / `list_manuscripts` tools note the local-only gating.
- Refreshed [`docs/MCP.md`](docs/MCP.md) with the new tool tables, prompts, and
  example workflows.

## What's new in v0.1.1

- **Workbench → article review alignment.** Promote a Methods study into a
  linked article, and import screening-record CSVs with an LLM-assisted column
  mapping shown as an approve-before-apply preview. Review-input readiness
  (review focus, target journal, research domain/type) now surfaces directly in
  the article workspace so a review run starts from complete inputs.
- **Local-only articles stay local.** An article promoted from a `local_only`
  study carries that confidentiality intent: its review and revision sessions
  are pinned to a local provider and cloud backends are refused for it,
  enforced on the server and reflected in the workspace provider picker.
- **CSV re-import correctness.** Re-importing a corpus CSV no longer overwrites
  previously-screened decisions or clobbers human-confirmed records, and
  approved column mappings and needs-review flags are honored exactly.
- Internal cleanup: a shared provider roster, deduplicated import/proposal
  helpers, and fewer redundant database queries.

## Privacy Model

The app stores data locally in SQLite and markdown exports. Cloud providers
receive manuscript or reviewer content only when you configure and use a cloud
API provider. Codex is also a cloud provider: its ChatGPT auth cache is stored
under the app data directory at `codex-home/auth.json`, and selected prompts are
sent to OpenAI when you run Codex-backed actions. Do not send PHI, PII,
embargoed manuscripts, or confidential peer review material to a cloud provider
unless you have the right to do so.

The Electron desktop app binds its server to `127.0.0.1` and protects local
`/api/*` requests with a short-lived app token injected by the Electron main
process. The headless CLI runs the same app on loopback; set
`RESEARCHDESK_APP_TOKEN` to authenticate `/api/*` when running from source. The
legacy `REVIEWER_APP_TOKEN` name is still accepted. Direct `npm run dev` /
`npm run start` is developer browser mode; do not expose any of these to a
network.

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
- pre-submission manuscript review — a **context-grounded ensemble**: several
  grounded reviewers run and a neutral merge consolidates them (no persona
  role-play). It is grounded in your prior reviews, scholarly search, and
  deterministic checks the model cannot do on its own — citation/DOI and
  retraction validation, statistical-possibility (GRIM) screening, and
  protocol-drift comparison against a linked Methods study. Press **Run review**
  in the workspace; advanced controls (provider, model, ensemble size) live
  behind the Advanced drawer.
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
responses, version creation, and finalization. For Codex, choose the model and
use the ChatGPT browser sign-in controls; API key and base URL are not used.
The older device-code flow is available only as a fallback.

The Settings page and the Methods Workbench setup panel show a live status for
every provider — what is reachable, what is missing an API key, and the exact
step to fix it — so configuration problems surface immediately instead of after
a long timeout. The same check is available at `GET /api/providers/health`.
`local_only` studies and articles still reject all cloud providers, including
Codex.

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
- a review workspace with explicit buttons for review, versioning, readiness,
  reviewer response, and finalization

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
- `Create new version`, `Run review`, `Readiness`, and `Finalize` buttons to
  continue the draft through revision and final submission checks.

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

ResearchDesk ships an MCP server (`mcp/server.mjs`) that lets a CLI agent such
as Claude Code or Codex drive the app. It is a stdio bridge to the app's local
REST API — no business logic of its own — and exposes tools to find/create a
study, import the scoping-review CSVs by path, inspect the corpus and PRISMA
flow, and build a self-contained drafting brief / `AGENTS.md` for any section.

It also exposes an **intake give-and-take**: tools to read the recorded design,
surface gaps and uncovered reporting-guideline items, and record the author's
answers, plus `methods_intake` / `screening_review` prompts that walk the agent
through the back-and-forth. The agent facilitates and the author decides — it
never invents research content.

For manuscripts it exposes `list_manuscripts`, `review_manuscript` (runs the
context-grounded ensemble review), and `get_reviews`, plus a `manuscript_review`
prompt that runs the review and walks the author through the findings. So a CLI
agent can review a manuscript end to end without the desktop UI.

New in 0.1.1: the MCP server can also promote a finished study into an article
draft (`promote_study_to_article`, the app's Create Article Draft step),
preview and apply records-CSV imports with an author-approved column mapping
(`preview_csv_import` / `apply_csv_import` + the `csv_import_review` prompt), and
toggle a study's confidentiality mode with `set_study_confidentiality` —
`local_only` pins all LLM calls to local providers.

The preferred release path is the bundled headless artifact. It includes its
own Node runtime and wrapper CLI, so users do not need `nvm`, `npx`, a global
Node install, or a checkout path:

```bash
./bin/researchdesk init
./bin/researchdesk server
./bin/researchdesk config codex
```

This Codex registration is for using the Codex CLI as an MCP client. It is
separate from `Settings` -> `API Providers` -> `Codex`, which lets the app use
Codex as its own LLM provider through ChatGPT login.

For MCP clients, `researchdesk mcp --with-server` starts a private loopback app
server for the MCP session and shuts it down when the client exits.

When developing from source, run the app headless first, then point the MCP
server at it:

```bash
npm run build
export RESEARCHDESK_APP_TOKEN=$(openssl rand -hex 32) # authenticates /api/*
npm run start:server                                 # binds 127.0.0.1
```

See [`docs/MCP.md`](docs/MCP.md) for the headless runbook and the Claude Code /
Codex registration snippets. The headless server is local-only; keep it on
loopback and set `RESEARCHDESK_APP_TOKEN` so `/api/*` is authenticated.

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
npm run headless:bundle
npm run typecheck
npm run lint
npm test
npm run desktop:dist      # local macOS arm64 package
npm run desktop:dist:win
```

## Data

SQLite data and markdown exports are stored under `RESEARCHDESK_DATA_DIR`,
defaulting to `./data` from source. The legacy `REVIEWER_DATA_DIR` name is still
accepted.

## Security

See [`SECURITY.md`](SECURITY.md) for the local app security model and reporting
process.
