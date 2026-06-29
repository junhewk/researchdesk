# Persona-vs-Context Review Experiment

A pre-registered 2×2 factorial that tests whether **reviewer personas** (the
commercial-app pitch) actually improve manuscript review, or whether any benefit
comes from **context grounding** — the stance this product takes. Full design and
hypotheses: `~/.claude/plans/there-are-many-apps-lovely-treehouse.md`.

## The six arms

| Arm | Persona (A) | Context (B) | What it is |
|---|---|---|---|
| `naive` | — | — | one integrated reviewer, manuscript only |
| `persona` | 4 named experts | — | persona panel + merge |
| `context` | — | grounded | **== the product** (`runReviewAgent`) |
| `persona_context` | 4 named experts | grounded | persona panel (shared context) + merge |
| `ensemble_naive` | 4 **identical** reviewers | — | H4 control vs `persona` |
| `ensemble_context` | 4 **identical** reviewers | grounded | H4 control vs `persona_context` |

The persona and ensemble arms run the same number of calls (4 + merge), so any
`persona − ensemble` difference is the persona *framing*, not the ensembling.

Same base model + decoding for every arm (the central confound to control).

## Code map

- `src/server/apiAgent/workflows.ts` — `reviewManuscriptStructured()` is the
  shared core pass (two factor clauses, no persistence). `runReviewAgent()` (the
  product) now delegates to it = the `context` arm. *One documented refinement:
  the product prompt now states its anti-persona/grounded stance explicitly.*
- `src/server/experiment/reviewArms.ts` — `PERSONA_ROSTER`, `ARMS`, `runArm()`.
- `scripts/experiment/run-arms.ts` — generate reviews → `runs/`.
- `scripts/experiment/build-answer-keys.ts` — deterministic ground truth → `answer_keys/`.
- `scripts/experiment/judge.ts` — blinded LLM-judge → `scores.jsonl`, `gold_obs.jsonl`, `item_obs.jsonl`.
- `scripts/experiment/export-rating-packets.ts` — blinded packets for human judge-validation.
- `scripts/experiment/analyze.R` — pre-registered GLMMs (freeze before running).

## Runbook

```bash
# 0. Verify the harness on the built-in seeded-defect pair (no API key needed)
npm run typecheck
npm run seed:demo
npm run exp:keys -- --manuscripts all          # gates should fire on the diabetes drift

# 1. Generate reviews — accuracy block (needs a provider API key)
npm run build && PORT=3871 npm run start:server &   # only needed for grounding's scholarly search
OPENAI_API_KEY=... npm run exp:run -- \
  --manuscripts all --arms naive,persona,context,persona_context,ensemble_naive,ensemble_context \
  --reps 3 --provider openai --model gpt-5.4 --temperature 0.1

# consistency block + replication
npm run exp:run -- --reps 5 --temperature 0.7 ...        # within-arm variance
npm run exp:run -- --provider gemini --model gemini-2.5-pro ...

# 2. Score (blinded LLM-judge)
npm run exp:judge -- --provider openai --model gpt-5.4 --temperature 0

# 3. Validate the judge against humans, then analyze
npm run exp:packets -- --n 400 --seed pilot-1
Rscript scripts/experiment/analyze.R
```

## Ground truth

`build-answer-keys.ts` runs the product's own LLM-free oracle:
- **gate layer (primary)** — `runReadinessPreChecks` + `runProtocolCompareChecks`.
- **checklist layer** — reporting-guideline items whose `detect_regex` fails.
- **reviewer layer** — human reviewer letters, captured verbatim for later
  atomization (LLM split + human check) into gold issues.

Gate hits are a **high-precision lower bound** (regex/token based). Augment each
seeded manuscript with an expert-curated defect ledger before drawing strong
conclusions; the deterministic key is the verified-true core, not the whole truth.

## Anti-bias guards (we already suspect personas are theater)

Pre-register hypotheses + `analyze.R` before any runs · judge and human raters
see arm-stripped, shuffled comments · keep the ensemble control (H4) · two-sided
tests, effect sizes + CIs · unblind arm labels only after models are fit.
