# Trial 05 — Expanded factorial with mixed-effects inference

Pools the 6 new manuscripts (case-control, cross-sectional, diagnostic, prediction/TRIPOD,
scoping review, RCT) with **trial 02** → **10 manuscripts × 6 arms × 2 reps**, all on
qwen3.6-27b, blinded Claude judge. **1,368 issue-level observations.** This is the
inferential version of the persona-vs-context result (the pilots were descriptive only).

## Per-arm recall (pooled, 10 manuscripts)

| Arm | recall (all gold) | recall (gate, primary) |
|---|---|---|
| naive | 0.52 | 0.11 |
| persona | 0.60 | 0.16 |
| context | 0.64 | 0.28 |
| persona_context | 0.67 | 0.28 |
| ensemble_naive | 0.62 | **0.31** |
| **ensemble_context** | **0.70** | **0.34** |

Best arm = grounded ensemble. Note `persona` (0.16) < `ensemble_naive` (0.31) on gate recall —
the persona panel is *worse* than the same-budget generic ensemble on the hardest issues.

## Mixed-effects estimates (odds ratios, 95% CI)

Issue-level logistic regression, `detected ~ personaA * contextB`, **cluster-robust by
manuscript** (primary); a Bayesian mixed GLM with manuscript + gold random intercepts agrees.

| Effect | All gold | Gate layer (primary) | Bayesian (all gold) |
|---|---|---|---|
| **Context main effect** | **1.69 [1.17, 2.44]**, p=.005 | **2.99 [1.35, 6.62]**, p=.007 | **3.79 [2.76, 5.21]** |
| Persona main effect\* | 1.38 [1.19, 1.60] | 1.53 [0.88, 2.67], p=.13 | 2.21 [1.62, 3.01] |
| Persona × context | 0.80 [0.60, 1.06] | 0.65 [0.34, 1.24] | 0.61 [0.39, 0.96] |

\* The "persona main effect" is **the ensembling effect**, not role-play — the persona cells are
4-reviewer panels. The control below removes the confound.

### H4 — persona vs a *matched* generic ensemble (the decisive test)

| Contrast | OR (is_persona) | 95% CI | p |
|---|---|---|---|
| context OFF (persona vs ensemble_naive) | **0.90** | [0.66, 1.22] | .49 |
| context ON (persona_context vs ensemble_context) | **0.87** | [0.66, 1.14] | .31 |

**Persona framing does not beat a same-budget generic ensemble** — both ORs sit just below 1
with CIs spanning 1. So the persona "advantage" is entirely the act of running N reviewers and
merging; the disciplinary costumes add nothing (and trend slightly negative).

## Conclusions (now with confidence intervals)

1. **Context grounding helps — robustly.** OR 1.69 overall (CI excludes 1), 2.99 on gate
   recall, 3.79 in the Bayesian model. This holds across 10 manuscripts and 6 guideline
   families, on a deployable model.
2. **Personas add nothing over ensembling** (H4 OR ≈ 0.9, CI spans 1; gate recall 0.16 vs the
   ensemble's 0.31). The 2×2 "persona main effect" is the ensembling, not the expertise.
3. **Ensembling is a real but persona-independent lever**; the best arm is the grounded
   ensemble (recall 0.70 / gate 0.34).

## Judge reliability (test-retest)

A second independent Claude judge pass on a 15-run subset (176 run×gold decisions) agreed
with the original on **every** per-gold detection: **Cohen's κ = 1.00, raw agreement 100%**.
The LLM-judge is highly *consistent* on the binary detection task — so the estimates above
are not an artifact of judge noise. (This is reliability, not validity: it shows the judge is
stable, not that it agrees with humans — human-rater validation, `exp:packets` → κ, is still
the missing piece.)

## Caveats
qwen generator, blinded Claude judge (test-retest κ = 1.00; human validity still pending). 10
manuscripts authored with planted ledgers (ecological validity via real open-peer-review
papers is future work). Cluster-robust SEs with 10 clusters are reasonable but not large; the
Bayesian random-effects model is the sensitivity check and agrees in direction and sign.
