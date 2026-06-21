# Reviewer-Agent MCP server

Drive the Reviewer-Agent app from **Claude Code** or **Codex** via the Model
Context Protocol. The MCP server (`mcp/server.mjs`) is a small stdio process that
bridges to the app's existing local REST API — so a CLI agent can find or create
a study, import scoping-review CSVs, inspect the screened corpus + PRISMA flow,
and generate a self-contained drafting brief / `AGENTS.md` for any paper section.

```
Claude Code / Codex ──stdio(MCP)──▶ reviewer-agent-mcp ──HTTP(+token)──▶ app (127.0.0.1:3871)
```

The MCP server holds no business logic; every tool wraps one `/api/studies/*`
route. The app is the single source of truth (SQLite + markdown exports).

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

| Tool                   | Wraps                                              | Use                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `list_studies`         | `GET /api/studies`                                 | find an existing study id (`st_…`)                          |
| `create_study`         | `POST /api/studies`                                | create a study (default mode `scoping_review`)             |
| `import_review_csv`    | `POST /api/studies/{id}/import`                    | import CSV file(s) by path; auto-detects search vs records |
| `corpus_overview`      | `GET …/prisma` + `…/records`                       | PRISMA flow + per-database yields + screening stats        |
| `export_corpus`        | `GET …/records/export`                             | round-trip records CSV, or characteristics table (csv/md)  |
| `build_drafting_brief` | `POST …/drafting-prompts`                          | self-contained brief / `AGENTS.md` for any section(s)      |

`build_drafting_brief` accepts `sections` (any of
`outline, introduction, methodology, results, discussion, abstract`) and/or a
freeform `task`. Results/Discussion are grounded in the screened corpus + PRISMA
counts; every prompt instructs the model to use only the recorded material and
never invent findings.

## 6. Example workflow

In Claude Code, with the two CSVs on disk:

> Use the reviewer-agent MCP to create a scoping review from
> `sdm_edu_scoping_process_260618.csv` and `sdm_edu_included_260618_user_confirm.csv`,
> then build an `AGENTS.md` for writing the Results and Discussion.

The agent will: `create_study` → `import_review_csv([both files])` →
`corpus_overview` → `build_drafting_brief(sections: ["results","discussion"])`,
and save the returned `AGENTS.md`.

## 7. Local smoke test (no agent)

```bash
npx @modelcontextprotocol/inspector node mcp/server.mjs
```

Set `REVIEWER_API_URL` / `REVIEWER_APP_TOKEN` in the Inspector's env, then call
the tools interactively against your running app.
