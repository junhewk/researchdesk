# ResearchDesk

A prompt harness for scholarly article work: methods decisions, article-drafting
prompts, readiness checks, and context-grounded review. Reviews are not
"hypothetical reviewer persona"-based; they are grounded in previous
commentaries, decisions, actual revisions, and deterministic checks.

## backend

Backend support is based on Next.js:

- claude-code headless mode (refer to /home/jk/programming/claude-board and ssh jkworkstation '/home/jk/programming/claude-code-main')
- TypeScript API agents through OpenAI-compatible providers, including OpenAI, Gemini, DeepSeek, Ollama, LM Studio, and llama-server

## frontend

Next.js 16+

- follow new conventions of ver 16 (for example, middleware to proxy https://nextjs.org/docs/messages/middleware-to-proxy)

## db convention

decide between: db vs. raw markdown files

if db:

- use sqlite
- this app is basically for individual use (currently i do not consider team use)
- table should preserve commentaries, decisions, user revisions, agent revisions
- also type of journal, research domain, research type

if raw markdown:

- use skill-type yaml to save frontmatters

## what this app should do

1. revision

- based on commentaries, provide revision suggestion
- search related previous commnetaries and revisions to reflect current move
- revision should deal all commentaries in exhaustive mode
- categorize suggestion between mechanical proofread & error correction vs. re-write needs
- for mechanical proofread and error correction, provide revised version of the manuscript, with <!-- / --> notation to show users what has been changed
- for re-write needs, provide helper to rewrite the paragraph/subsection by the user
- needs in-app editor that we can "save" the revision actions to use it afterwards

2. review

- ask user target journal/domain and research type
- search related previous commnetaries and revisions to reflect current move
- review the article in critical viewpoint, evaluate the logic and evidences
- web search (use scholarly db, not internet: need to add article_search function) to support review
- structure review based on:
    - mechanical proofread & error correction: provide corrections
    - re-write needs: provide in-app re-write helpers
    - structural errors: it cannot be revised in this app; request restructure/re-design the research or article and resubmit
    - re-consideration of evidences: provide statistical/literature help to reconsider evidences
- also needs in-app editor that we can "save" the revision actions to use it afterwards

3. tidying the "data"

- these commentaris, reviews, revisions, corrections, original manuscript and revised manuscript are all "data"
- need to preserve them in appropriate order/logic so we can "search" them, not just by "user", most of all, but by "agent" to enhance next jobs
- consider knowledge graph or Karpathy-style wiki https://x.com/karpathy/status/2039805659525644595

## what this app should not do

- just a "persona" review parrot, always provide similar review results based on some hypothetical "statistician, domain experts, etc."
- an "article creator": this article NEVER create a new article. novel findings and decisions ALWAYS for the user side

## methods workbench (upstream layer)

A third workspace, peer to "my articles" and "review requests", sits *upstream* of the manuscript review work: it helps the user build a study protocol, audit it, draft a statistical analysis plan and data dictionary, map a reporting guideline (PRISMA / STROBE / CONSORT / SPIRIT / STARD / TRIPOD / CARE / SRQR / COREQ / ARRIVE), run a manuscript-readiness check against an own-article, and compile a reviewer-response letter that lands back as an asset on the source manuscript. Protocols are first-class objects (`protocols` table, peer of `manuscripts` and `outside_manuscripts`) with their own versions, assets, FTS index, and a per-protocol confidentiality toggle (`cloud_default` | `local_only`). The methods workbench reuses the same supervisor / streaming / session UI as the manuscript workspaces; intent is selected by `sessions.workflow='methods'` + `sessions.mode` (one of `protocol_build` | `protocol_audit` | `sap` | `data_dictionary` | `reporting_checklist` | `readiness` | `reviewer_response`).
