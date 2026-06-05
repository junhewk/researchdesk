# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Initial implementation complete. All core features are in place. See `SPEC.md` for the authoritative description of intent.

## Build & Run

```bash
nvm use              # Node.js 26.x
npm install --include=dev
npm run dev          # Next.js 16 dev server with webpack (port 3871)
npm run build        # Production build
npm run typecheck    # TypeScript check (tsc --noEmit)
npm run lint         # ESLint
```

Note: `npm run dev` uses webpack on purpose. In this repo, Next.js 16.2.4 + Turbopack dev intermittently fails to register nested App Router API routes like `/api/manuscripts/[id]/commentaries`, which surfaces as false 404s.

Default port is **3871** (chosen to avoid collisions with common 3000/3001). Override with `PORT=xxxx npm run dev`. The agent calls back into the app via `REVIEWER_API_URL`, which defaults to `http://localhost:$PORT`.

Note: npm is configured with `omit=dev` — always use `--include=dev` when installing.

If Node.js is upgraded (or `better-sqlite3` throws `NODE_MODULE_VERSION` mismatch), rebuild with the new Node:

```bash
npm rebuild better-sqlite3
```

Remote browser access is not a supported default. The desktop app binds its
local server to `127.0.0.1` and protects `/api/*` with a short-lived app token.

## Architecture

**Backend**: Claude Code, Codex CLI, and TypeScript/LangChain API agents behind provider abstractions (`src/server/agentProcess.ts`, `src/server/apiAgent/`).
- `ClaudeProcess`: spawns `claude` CLI as subprocess with NDJSON stream-json protocol. Auto-detects CLI from PATH, `~/.local/bin`, `~/.claude/local`, `/usr/local/bin`, `/opt/homebrew/bin`. Override with `CLAUDE_BIN`. Per-session model/effort are passed as CLI flags.
- `CodexProcess`: runs `codex exec` in JSON mode per turn, resumes the provider thread, and passes per-session model/effort as CLI config. Override with `CODEX_BIN`.
- API-agent workflows are implemented in TypeScript and call OpenAI-compatible cloud/local providers through LangChain adapters.

**Frontend**: Next.js 16 App Router + Server Components + Tailwind CSS 4 + shadcn/ui primitives

**Design system**: Editorial/manuscript aesthetic
- Typography: Fraunces (display), Source Serif 4 (body), IBM Plex Mono (metadata)
- Palette: warm paper `#f2ede0`, deep ink, editor's red `#a4121c` for annotations
- Categories: mechanical=navy, rewrite=ochre, structural=oxblood, evidence=plum — all rendered as outlined small-caps chips, not filled pills
- Change markers in editor: red strikethrough italic for deletions, green bold for insertions
- Avoid card/box components when possible — use hairline rules, double rules, and small-caps section labels instead
- All style tokens in `src/app/globals.css` under `@theme`; status/category style classes in `src/lib/styles.ts`

**Storage**: SQLite (better-sqlite3, WAL mode) + markdown export dual-write
- FTS5 virtual tables for agent-side full-text search
- Relations table for basic knowledge graph (entity links)
- Markdown exports in `data/exports/`
- Data dir env var: `REVIEWER_DATA_DIR` (not `DATA_DIR`, to avoid conflicts with other projects)

**Editor**: CodeMirror 6 with `<!-- deleted / inserted -->` change marker visual decorations — red ink for deletions, green ink for insertions, Fraunces italic arrow as separator

## Key Directories

- `src/server/` — data layer, agent processes, supervisor, search, tools
- `src/app/api/` — Next.js API routes
- `src/app/my-articles/` — top-level workspace routes for the user's own articles
- `src/app/review-requests/` — top-level workspace routes for confidential third-party review requests
- `src/app/methods-workbench/` — top-level routes for the Methods Workbench (re-exports from `src/app/methods/`)
- `src/app/methods/` — implementation pages for the Methods Workbench (protocols, audits, SAP, data dictionary, checklists, readiness, reviewer responses)
- `src/app/manuscripts/` — compatibility page implementations reused by the top-level routes
- `src/components/` — React components (UI primitives, session streaming, editor)
- `src/lib/` — shared utilities (`utils.ts`, `styles.ts`, `changeMarkers.ts`), hooks

## Workspaces

1. **My articles** (`/my-articles`): Upload the user's own article → use Claude/Codex/OpenAI freely for revision (`/my-articles/[id]/revise`), pre-submission review (`/my-articles/[id]/review`), and editor work.
2. **Review requests** (`/review-requests`): Upload a manuscript the user is reviewing for others → default local-only outline and detail generation → optional paragraph-level cloud assist only after explicit consent. External scholarly search is a separate opt-in.
3. **Methods Workbench** (`/methods-workbench`): Upstream methods-quality layer. Build and audit study protocols, draft SAPs and data dictionaries, map reporting guidelines (PRISMA/STROBE/CONSORT/SPIRIT/STARD/TRIPOD/CARE/SRQR/COREQ/ARRIVE), run manuscript-readiness checks, and compile reviewer-response letters. Protocols default to `cloud_default` but expose a per-protocol `local_only` toggle that routes sessions through `localProcess.ts`. Manuscript-scoped modes (readiness, reviewer response) live under `/methods-workbench/readiness/[id]` and `/methods-workbench/reviewer-responses/[id]`; entry buttons live in the My-Articles workspace header.

## Agent Tools

Defined in `src/server/tools.ts`, executed server-side by the supervisor (`src/server/supervisor.ts`):
- `search_commentaries`, `search_revisions`, `search_reviews` — FTS5 search over past data
- `get_manuscript`, `get_commentaries`, `get_related_items` — data retrieval
- `create_suggestion` (revision) / `create_review_item` (review) — structured output
- `article_search` — Semantic Scholar + OpenAlex scholarly search

## Shared Modules

- `src/lib/styles.ts` — all status/category/severity style maps (single source of truth)
- `src/lib/utils.ts` — `cn()`, `formatDate()`, `nowUnix()`, `groupBy()`
- `src/server/manuscripts.ts` exports `touchManuscript()` — used by commentaries, revisions, reviews

## Critical Rules

- The agent NEVER generates novel research content — all creative decisions belong to the user
- The agent is NOT a "hypothetical reviewer persona" — suggestions must be grounded in actual prior commentaries and revision patterns
- Data (commentaries, reviews, revisions) is first-class — the agent searches it to improve subsequent jobs
- Review-request full text must stay out of normal cloud-bound own-article prompts and internal search endpoints. Only `outsideReview.ts` may use review-request content, and cloud use must respect `outside_manuscripts.confidentiality_mode`.
