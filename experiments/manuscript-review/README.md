# Manuscript-Review Experiment — Persona vs Context vs Ensemble

Does asking an LLM to role-play "expert reviewer personas" (statistician, methodologist,
editor…) actually improve manuscript review — or is any gain just ensembling, with
**context grounding** being the real lever? A 2×2 factorial (persona on/off × context on/off)
plus two ensemble controls, scored against objective ground truth by a blinded judge.

Design + hypotheses: `~/.claude/plans/there-are-many-apps-lovely-treehouse.md` ·
Harness/runbook: `docs/EXPERIMENT.md`.

## Read this first
- **`COMPARISON.md`** — the headline: how persona/context/ensemble effects change between a
  strong and a weak base model. **Start here.**

## Trials (preserved)
| Trial | Generator model | Judge | Runs | Folder | What it shows |
|---|---|---|---|---|---|
| 01 | Claude (frontier) | Claude | 24 | `trials/01-claude-checklist/` | Strong-model: personas = ensembling; ceiling hides context |
| 02 | qwen3.6-27b (local) | Claude | 48 | `trials/02-qwen3_6-27b-checklist/` | Weak-model: context helps (+0.24 gate), personas hurt, fabrication appears |
| 03 | qwen3.6-27b (local) | Claude | 24 | `trials/03-phaseb-grounding/` | **Categorical gap**: external-only errors — grounded 1.00 vs others ~0 |
| 04 | qwen3.6-27b (local) | Claude | 24 | `trials/04-phaseb2-integrity/` | GRIM is categorical; statcheck/tortured-phrase/AI-tell are **redundant** (model self-catches) |
| 05 | qwen3.6-27b (local) | Claude | 72 | `trials/05-expanded-factorial/` | **Inferential** (pools w/ 02 → 10 manuscripts): context OR 1.69 [1.17, 2.44]; persona ≈ ensemble (H4 OR 0.90) |

Each trial folder has `config.json`, `RESULTS.md` (metrics + interpretation), `results.json`
(per-arm-run verdicts), and the generation/judge artifacts.

## Shared inputs (regenerable)
- `manifest.json` — per-manuscript prompts (identical across trials) + merged gold + grounding.
- `answer_keys/` — deterministic gate + checklist gold per manuscript.
- `ledgers.json` — curated planted-defect ledgers for the 3 authored manuscripts.

## Six arms
`naive` · `persona` (4-lens panel + merge) · `context` (= product, checklist-grounded) ·
`persona_context` · `ensemble_naive` / `ensemble_context` (4 **identical** reviewers + merge —
the H4 control that separates persona framing from plain ensembling).

## Reproduce
```bash
# shared inputs
REVIEWER_DATA_DIR=<db> npm run exp:seed-corpus && npm run exp:keys -- --manuscripts all && npm run exp:manifest -- --manuscripts all
# weak-model generation (local llama-server, grammar-constrained JSON, Qwen3 sampling)
node scripts/experiment/run-arms-http.mjs --out trials/02-qwen3_6-27b-checklist/runs --url http://HOST:8091/v1 --model qwen3.6-27b-mtp-q8 --reps 2
# judging (Claude workflow) + analysis
#   build judge-input from runs+manifest → splice into trials/02 judge-wf-body.js → run Workflow → results.json
node scripts/experiment/analyze-pilot.mjs trials/02-qwen3_6-27b-checklist/results.json manifest.json --label qwen3.6-27b --out trials/02-qwen3_6-27b-checklist/RESULTS.md
```

## Status
- ✅ Trial 01 (strong model) · ✅ Trial 02 (weak model) · ✅ Trial 03 (Phase B, categorical gap)
- ⏳ Wire the live validators (`/api/articles/validate`, `/api/quantitative/check`, protocol
  cards) into the grounded arm so it computes the grounding pack itself (Phase B used a
  stand-in pack).
- ⏳ Judge validation against human raters (`exp:packets` → κ); scale up (more manuscripts/reps,
  GLMMs in `analyze.R`).
