# Persona vs Context vs Ensemble — Model-Strength Comparison

Same prompts, same manuscripts, same checklist grounding, same blinded **Claude judge**.
The only thing that changes between trials is the **review-generating model**. This isolates
how each effect depends on base-model strength.

- **Trial 01** — strong model: **Claude** (`trials/01-claude-checklist/`), 24 arm-runs.
- **Trial 02** — weak model: **qwen3.6-27b-mtp-q8** local (`trials/02-qwen3_6-27b-checklist/`), 48 arm-runs.

## Key contrasts

| Effect (factorial) | Claude (strong) | qwen3.6-27b (weak) | What it means |
|---|---|---|---|
| **Context → overall recall** | −0.03 (flat) | **+0.14** | Grounding helps the weak model; the strong one was at ceiling |
| **Context → gate recall** (primary) | −0.07 | **+0.24** | naive→context gate recall: 0.40→0.40 (Claude) vs **0.03→0.29** (qwen) |
| **Persona → gate recall** | +0.27\* | +0.00 | \*Claude's "persona gain" was entirely ensembling (H4≈0) |
| **Persona vs matched ensemble** (H4, gate) | 0.00 (tie) | **−0.27** (persona *worse*) | Personas never beat a plain ensemble; on the weak model they actively hurt |
| **Hallucination rate** | ~0.00 (ceiling) | **1.9%** → 0.00–0.01 with grounding+ensemble | Fabrication only appears on the weak model; grounding/ensembling suppress it |
| **Best arm (overall recall)** | ensembles tie (~0.87) | **context+ensemble** (0.63) | Winning recipe is the same shape: grounded ensemble |

## The three conclusions for the talk

1. **Personas are not a quality lever — at best neutral, at worst harmful.**
   On the strong model they merely tied a generic ensemble (the apparent gain was running
   the model 4× and merging). On the weak model the persona framing was *worse* than the
   same-budget ensemble on the issues that matter most (gate-level: ethics, data-availability,
   registration, protocol drift), because each "lens" narrows away from cross-cutting issues —
   and personas also produced the most hallucinations.

2. **Context grounding is a real lever, and its value grows as models get weaker/cheaper.**
   Invisible on a frontier model (ceiling), it is large on a deployable 27B model: +0.24 gate
   recall, and it drives the (newly visible) fabrication toward zero. This is the "context
   gives more" result — it just only shows up where there's room to improve.

3. **The right architecture is a context-grounded ensemble**, not a persona panel:
   ensembling for breadth + grounding for correctness/coverage, personas contributing nothing.
   Best arm in both trials is the grounded ensemble.

## Inferential result (trial 05 — 10 manuscripts, 1,368 issue-level obs)

Scaling the weak-model factorial to **10 manuscripts × 6 arms × 2 reps** and fitting
mixed-effects logistic models (cluster-robust by manuscript; Bayesian random-effects
sensitivity) turns the pilot into estimates with confidence intervals:

| Effect | OR (all gold) | OR (gate, primary) |
|---|---|---|
| **Context grounding** | **1.69 [1.17, 2.44]** | **2.99 [1.35, 6.62]** |
| **Persona vs matched ensemble (H4)** | **0.90 [0.66, 1.22]** | persona 0.16 vs ensemble 0.31 recall |

Context's benefit is robust (CI excludes 1, and a Bayesian model gives OR 3.79 [2.76, 5.21]).
**Persona framing does not beat a same-budget generic ensemble** (H4 OR ≈ 0.9, CI spans 1, point
estimate below 1) — confirming, now inferentially, that the persona "advantage" is just
ensembling. Details: `trials/05-expanded-factorial/RESULTS.md`.

## Phase B (trial 03) — the categorical gap

Trials 01–02 measured a *marginal* gap (grounding catches somewhat more on a weak model).
Trial 03 measures a *categorical* one: errors whose truth lives **outside** the manuscript —
a fabricated DOI, a retracted citation, outcome-switching vs the registered protocol, a
p-value that fails recomputation. The `grounded` arm gets a verified protocol + citation
+ recomputation pack; `naive`/`persona`/`ensemble` see only the paper.

| | naive | persona | ensemble | grounded |
|---|---|---|---|---|
| Recall on external-only errors | 0.00 | 0.08 | 0.08 | **1.00** |

**You cannot ensemble or role-play your way to a fact you were never given.** This is the
structural ceiling of the persona-app category, and the strongest single result for "context
finds what personas fundamentally can't." (Caveat: the pack stands in for the product's live
DOI/stat/protocol tools; wiring those in so the arm computes the pack itself is the next step.)
Details: `trials/03-phaseb-grounding/RESULTS.md`.

## Phase B-2 (trial 04) — not everything worth grounding is worth grounding

We added two more pre-defined grounding items and tested whether they catch errors the
manuscript-only arms miss: a **statistical-impossibility battery** (GRIM + statcheck) and a
**tortured-phrase / AI-tell lexicon**. The grounding pack here is *computed by real tools*.

| Check | naive | persona | ensemble | grounded | Verdict |
|---|---|---|---|---|---|
| GRIM (impossible mean) | 0.00 | 0.00 | 0.00 | **1.00** | **Categorical** |
| statcheck (p recompute) | 0.67 | 1.00 | 1.00 | 1.00 | Redundant (reliability only) |
| tortured phrase | 1.00 | 1.00 | 1.00 | 1.00 | **Redundant** |
| AI boilerplate | 1.00 | 1.00 | 1.00 | 1.00 | **Redundant** |

**The phrase list does not help detection** — every arm flags "profound learning" as
non-standard wording and "As an AI language model…" as boilerplate on its own. Its only value
is *labeling* (paper-mill fingerprint → desk-reject), not finding. **GRIM is the one categorical
win** (the model can't do the arithmetic).

This sharpens the whole thesis into one rule: **grounding earns its keep only where the model is
*structurally incapable* (look up a DOI, retrieve a protocol, do GRIM arithmetic) — not where
it's merely *uninstructed* (odd phrasing, rough p-value sense).** Persona panels lose on the
former and tie on the latter; they never win. Details: `trials/04-phaseb2-integrity/RESULTS.md`.

## Judge reliability

A second independent Claude judge pass on a 15-run subset (176 run×gold decisions) reproduced
the original detections exactly: **test-retest Cohen's κ = 1.00**. The LLM-judge is highly
consistent (the estimates aren't judge noise). This is *reliability*, not *validity* — human-
rater validation is the remaining gap.

## Caveats (same for all trials)

Pilot scale (4 manuscripts; 1–2 reps). Descriptive, no CIs. LLM-judge (Claude) not yet
human-validated (run `exp:packets` → raters → κ). 3 of 4 manuscripts authored with planted
ledgers. Context arm = reporting-checklist grounding only; protocol-diff / citation &
quantitative validators are **Phase B**, which should widen the context advantage into a
*categorical* one (errors personas/ensembles structurally cannot reach).
