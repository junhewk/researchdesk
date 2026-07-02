# Reviewer-Agent MCP server

Drive the Reviewer-Agent app from **Claude Code** or **Codex** via the Model
Context Protocol. The MCP server (`mcp/server.mjs`) is a small stdio process that
bridges to the app's existing local REST API — so a CLI agent can find or create
a study, import scoping-review CSVs (one-shot, or with an LLM-proposed,
author-approved column mapping), inspect the screened corpus + PRISMA flow,
generate a self-contained drafting brief / `AGENTS.md` for any paper section,
**promote a finished study into an article draft**, and run the product's
context-grounded **ensemble review** on a manuscript.

```
Claude Code / Codex ──stdio(MCP)──▶ reviewer-agent-mcp ──HTTP(+token)──▶ app (127.0.0.1:3871)
```

The MCP server holds no business logic; every tool wraps one `/api/studies/*`,
`/api/manuscripts/*`, or `/api/study-article-imports` route. The app is the single
source of truth (SQLite + markdown exports).

## 1. Run the app headless (Linux server, no GUI)

The app runs as a plain Next.js server — **no Electron, no display required**, and
the database is Node's built-in `node:sqlite` (no native build).

```bash
nvm use                       # Node 26.x
npm install --include=dev
npm run build

export REVIEWER_DATA_DIR=/srv/reviewer/data         # where reviewer.db lives
export REVIEWER_APP_TOKEN=$(openssl rand -hex 32)    # enables /api auth (recommended)
PORT=3871 npm run start:server                       # binds 127.0.0.1
```

- `npm run start:server` binds to `127.0.0.1` (the plain `npm run start` lets Next
  listen on all interfaces). Keep it on loopback unless you intend remote access.
- If `REVIEWER_APP_TOKEN` is **unset**, `/api/*` is left **unauthenticated** — fine
  on a single-user loopback box, but set the token if anything else can reach the
  port. The same token must be given to the MCP server (below).
- Keep the server alive with your process manager of choice (`systemd`, `pm2`, a
  `tmux`/`nohup` session, …); the MCP tools need it running.

Verify:

```bash
curl -s localhost:3871/api/studies                                   # 401 if token set
curl -s -H "x-reviewer-app-token: $REVIEWER_APP_TOKEN" localhost:3871/api/studies   # 200
```

## 2. Configuration

The MCP server reads two environment variables:

| Variable              | Default                  | Purpose                                  |
| --------------------- | ------------------------ | ---------------------------------------- |
| `REVIEWER_API_URL`    | `http://localhost:3871`  | base URL of the running app              |
| `REVIEWER_APP_TOKEN`  | _(none)_                 | must match the app's token (sent as `x-reviewer-app-token`) |

## 3. Register with Claude Code

Add to your project `.mcp.json` (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "reviewer-agent": {
      "command": "node",
      "args": ["/home/jk/programming/reviewer-agent-desktop/mcp/server.mjs"],
      "env": {
        "REVIEWER_API_URL": "http://localhost:3871",
        "REVIEWER_APP_TOKEN": "<same token as the app>"
      }
    }
  }
}
```

## 4. Register with Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.reviewer-agent]
command = "node"
args = ["/home/jk/programming/reviewer-agent-desktop/mcp/server.mjs"]

[mcp_servers.reviewer-agent.env]
REVIEWER_API_URL = "http://localhost:3871"
REVIEWER_APP_TOKEN = "<same token as the app>"
```

## 5. Tools

**Corpus & drafting**

| Tool                   | Wraps                                              | Use                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `list_studies`         | `GET /api/studies`                                 | find an existing study id (`st_…`)                          |
| `create_study`         | `POST /api/studies`                                | create a study (default mode `scoping_review`)             |
| `import_review_csv`    | `POST /api/studies/{id}/import`                    | one-shot import by path; auto-detect heuristics — prefer preview/apply for nonstandard records CSVs |
| `preview_csv_import`   | `POST …/import/preview`                            | propose a column mapping for the author to approve (LLM for records CSVs; deterministic for search) |
| `apply_csv_import`     | `POST …/import/apply`                              | apply the author-approved mapping (records CSVs require one; re-import keeps confirmed decisions unless told otherwise) |
| `corpus_overview`      | `GET …/prisma` + `…/records`                       | PRISMA flow + per-database yields + screening stats        |
| `export_corpus`        | `GET …/records/export`                             | round-trip records CSV, or characteristics table (csv/md)  |
| `build_drafting_brief` | `POST …/drafting-prompts`                          | self-contained brief / `AGENTS.md` for any section(s)      |

**Intake & give-and-take** (read the design, surface gaps, record the author's answers)

| Tool                   | Wraps                                              | Use                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `get_design`           | `GET …/cards`                                       | the decision cards: state, required fields, values, open questions |
| `analyze_gaps`         | `GET …/preflight`                                   | completeness/consistency/risk findings, guideline coverage, readiness %, next-best action |
| `checklist_coverage`   | `GET …/artifacts/checklist_map`                     | reporting-guideline items: covered / uncovered + source cards |
| `update_card`          | `PATCH …/cards/{type}`                              | record the author's decision on a card (value/fields/state/open question) |
| `update_study`         | `PATCH …/{id}`                                       | record the author's research question / title / status     |
| `record_gap`           | `POST …/preflight/findings`                         | persist a gap/need as a finding the author sees in the app |
| `list_records`         | `GET …/records`                                     | records with internal id + screen reason (drive screening review) |
| `set_record_decision`  | `PATCH …/records/{rid}`                              | record the author's include/exclude/maybe decision         |

`build_drafting_brief` accepts `sections` (any of
`outline, introduction, methodology, results, discussion, abstract`) and/or a
freeform `task`. Results/Discussion are grounded in the screened corpus + PRISMA
counts; every prompt instructs the model to use only the recorded material and
never invent findings.

**Promotion & confidentiality** (promote a study into an article, control cloud use)

| Tool                       | Wraps                                     | Use                                                              |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `set_study_confidentiality`| `PATCH …/{id}/confidentiality`            | `cloud_default` ↔ `local_only`; local_only → cloud needs the author's explicit `consent` |
| `list_promotable_studies`  | `GET /api/study-article-imports`          | studies + their linked article draft (or `null` if none yet)     |
| `promote_study_to_article` | `POST /api/studies/{id}/article`          | create/reuse the article draft from the recorded design; carries `confidentiality_mode` |

**Manuscripts & review** (run the context-grounded ensemble review, read findings)

| Tool                  | Wraps                                          | Use                                                          |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `list_manuscripts`    | `GET /api/manuscripts`                         | find a manuscript id (+ title/status/linked study)          |
| `review_manuscript`   | `POST …/{id}/reviews/run-agent`                | run the grounded **ensemble** review (default 3 reviewers + merge); returns `{created, summary_md}` |
| `get_reviews`         | `GET …/{id}/reviews`                           | read the merged findings (category, severity, section_ref)  |

`review_manuscript` is the product's recommended review — an ensemble of grounded
reviewers + a neutral merge, with a deterministic grounding pack (GRIM impossible
means, DOI/retraction checks, protocol drift when a study is linked) injected.
**It is not a persona panel.** Omit `ensemble_count` for the default (3); pass `1`
for a fast single grounded pass. `provider`/`model` override the app's configured
default. DOI/retraction validation makes external calls (DOI strings only) — this
is the own-article path, which permits it.

**Confidentiality.** A `local_only` study pins its LLM-backed operations to local
providers (ollama, lmstudio, llama_server). `preview_csv_import` **rejects** a
cloud provider for such a study with a 400; reviews of an article promoted from a
local_only study are **coerced** to a local backend (default ollama) rather than
ever reaching the cloud. Toggle the mode with `set_study_confidentiality` —
switching back to `cloud_default` requires the author's explicit `consent=true`.

## 5a. Prompts (give-and-take playbooks)

The server also exposes MCP **prompts** — reusable playbooks the calling agent
loads (Claude Code shows them as `/mcp__reviewer-agent__<name>`). They encode the
back-and-forth loop and the hard **no-invent rule**: the agent *facilitates*, the
author *decides*; the agent never fabricates research content.

- **`methods_intake(study_id)`** — read the recorded design (`get_design`,
  `analyze_gaps`, `checklist_coverage`), summarise what's missing / underspecified
  / conflicting and which guideline items are uncovered, **ask the author** (the
  agent uses its own AskUserQuestion), and record their answers with `update_card`
  / `update_study`; loop until ready.
- **`screening_review(study_id)`** — walk the author through the records the
  imported AI screening flagged (`list_records` needs_review), ask for each
  decision, and record it with `set_record_decision`.
- **`csv_import_review(study_id)`** — preview a records/search CSV
  (`preview_csv_import`), present the proposed column mapping to the author for
  approval or correction, apply the approved mapping (`apply_csv_import`), and
  confirm the result with `corpus_overview`. Encodes the approve-before-apply loop.
- **`manuscript_review(manuscript_id?)`** — pick a manuscript (`list_manuscripts`;
  if none exists yet but a study does, offer `promote_study_to_article`), run the
  grounded ensemble review (`review_manuscript`), read the merged findings
  (`get_reviews`), and walk the author through them by severity — flagging the
  citation-integrity / GRIM / protocol-drift findings the text alone can't reveal.
  Explicitly **not** a persona panel.

This is the intended flow after the author imports their files: import
(preview/apply for nonstandard CSVs) → run `methods_intake` to fill gaps and
tighten the design through Q&A → `build_drafting_brief` → `promote_study_to_article`
→ `manuscript_review`.

**Cues without the prompt.** The MCP server can't call the agent's
AskUserQuestion itself, so the intake/screening tools append a `→ NEXT:` cue to
every result (e.g. `analyze_gaps` → *"ask the author each finding, then record
with update_card"*). These fire on every call even when the user never loaded a
prompt — they nudge the agent into the ask-then-record loop. They're advisory,
not enforced; a server-enforced ask needs MCP *elicitation* (client support
required), which this version does not use.

## 6. Example workflow

In Claude Code, with the two CSVs on disk:

> Use the reviewer-agent MCP to create a scoping review from
> `sdm_edu_scoping_process_260618.csv` and `sdm_edu_included_260618_user_confirm.csv`,
> then build an `AGENTS.md` for writing the Results and Discussion.

The agent will: `create_study` → `import_review_csv([both files])` →
`corpus_overview` → `build_drafting_brief(sections: ["results","discussion"])`,
and save the returned `AGENTS.md`. If the records CSV comes from another screening
tool and its columns don't match, the agent uses `preview_csv_import` → shows you
the proposed mapping → `apply_csv_import` with your approved mapping instead.

To turn a finished study into a reviewable article:

> Use the reviewer-agent MCP to turn my scoping-review study into an article draft
> and run the grounded review.

The agent will: `list_promotable_studies` (resolve which study) →
`promote_study_to_article` → `review_manuscript` → `get_reviews`.

To review a manuscript instead:

> Use the reviewer-agent MCP to review my manuscript "Effect of …" and give me the
> findings grouped by severity.

The agent will: `list_manuscripts` (resolve the title → id) → `review_manuscript`
(grounded 3-reviewer ensemble + merge) → `get_reviews`, then relay the findings —
surfacing any unresolved/retracted DOI, GRIM, or protocol-drift items first.

## 7. Local smoke test (no agent)

```bash
npx @modelcontextprotocol/inspector node mcp/server.mjs
```

Set `REVIEWER_API_URL` / `REVIEWER_APP_TOKEN` in the Inspector's env, then call
the tools interactively against your running app.
