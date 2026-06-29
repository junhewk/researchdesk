# Persona-vs-Context Review — Pilot Results

Base model: **Claude** (held constant across all arms). Manuscripts: 4. Arm-runs scored: 24. Reps per cell: ~1.

Ground truth = deterministic readiness gates + reporting-checklist gaps + a curated planted-defect ledger. Comments were blind-judged (arm identity stripped, order hashed).

| Metric | naive | persona | context | persona_context | ens_naive | ens_context |
|---|---|---|---|---|---|---|
| Recall (all gold) | 0.65 | 0.86 | 0.69 | 0.77 | 0.87 | 0.78 |
| Recall — gate (primary) | 0.35 | 0.74 | 0.40 | 0.55 | 0.74 | 0.55 |
| Recall — checklist | 0.83 | 1.00 | 0.92 | 1.00 | 1.00 | 0.92 |
| Recall — ledger (curated) | 0.93 | 0.93 | 0.89 | 0.89 | 1.00 | 0.93 |
| Precision (valid/items) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Hallucination rate | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 |
| Specificity (0-2) | 1.98 | 1.89 | 2.00 | 1.90 | 1.96 | 1.93 |
| Actionability (0-2) | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| Comments per run | 12.5 | 18.5 | 12.8 | 17.0 | 17.8 | 15.3 |
| Redundancy (items/gold) | 0.91 | 0.82 | 0.93 | 0.88 | 0.91 | 0.91 |

## Factorial contrasts (2×2 cells)

| Metric | Persona main effect | Context main effect | Interaction | H4: persona−ensemble (ctx off / on) |
|---|---|---|---|---|
| Recall (all gold) | +0.15 | -0.03 | -0.13 | -0.01 / -0.01 |
| Recall — gate (primary) | +0.27 | -0.07 | -0.24 | +0.00 / +0.00 |
| Recall — checklist | +0.13 | +0.04 | -0.08 | +0.00 / +0.08 |
| Recall — ledger (curated) | +0.00 | -0.05 | +0.00 | -0.07 / -0.05 |
| Precision (valid/items) | +0.00 | +0.00 | +0.00 | +0.00 / +0.00 |
| Hallucination rate | +0.00 | +0.00 | +0.00 | -0.01 / +0.00 |
| Specificity (0-2) | -0.09 | +0.01 | -0.02 | -0.07 / -0.04 |
| Actionability (0-2) | +0.00 | +0.00 | +0.00 | +0.00 / +0.00 |
| Comments per run | +5.1 | -0.6 | -1.8 | +0.8 / +1.8 |
| Redundancy (items/gold) | -0.07 | +0.04 | +0.04 | -0.09 / -0.03 |

_Reading: context main effect should be **positive** for recall and **negative** for hallucination (H1); persona main effect near zero or adverse (H2); interaction near zero (H3); H4 persona−ensemble near zero ⇒ persona = ensembling, not expertise._

## Interpretation

**Headline: the apparent "persona advantage" is ensembling in disguise — it has nothing to do with expert role-play.**

1. **Persona framing adds nothing over a matched generic ensemble (H4 confirmed).**
   `persona − ensemble_naive ≈ 0` and `persona_context − ensemble_context ≈ 0` on
   every metric (gate recall: 0.74 vs 0.74; 0.55 vs 0.55). Four reviewers labelled
   "statistician / methodologist / domain expert / editor" did **no better** than
   four *identical, unlabelled* reviewers merged the same way. The persona costume
   contributes nothing once you hold the number of reviews + the merge constant.

2. **What actually moves recall is sampling N reviews and merging — not who they
   pretend to be.** The big jump (gate recall 0.35 → 0.74) appears when going from
   one reviewer to four-plus-merge, and it appears *equally* for personas and for
   generic ensembles. The persona "main effect" (+0.27 gate) is real only because
   the 2×2 cell labelled "persona" happens to be a 4-reviewer ensemble; strip the
   ensembling (the H4 control) and the persona effect vanishes.

3. **Grounding (this subset) didn't raise recall here — and precision/hallucination
   were at ceiling.** Context main effect on recall ≈ 0 (even slightly negative on
   gate recall: injecting the checklist seems to *narrow* attention toward checklist
   items and away from intrinsic/protocol gates). Precision = 1.00 and hallucination
   ≈ 0.00 for **every** arm, so the product's core promise — grounding prevents
   fabrication — **could not be tested**: this base model didn't fabricate regardless.

**Bottom line for the original question.** The data support your skepticism that
"reviewer personas" make reviews better: the personas added nothing a plain ensemble
didn't. But the honest mechanism is *ensembling*, not personas, and on a strong model
the context arm's headline benefit (less hallucination) is masked by a ceiling effect.

## Caveats (this is a pilot, not the pre-registered study)

- **Base model = Claude, not gpt-5.4** (no API key was available). Strong-model
  ceiling effects (precision 1.0, hallucination ≈ 0) likely *hide* grounding's
  anti-fabrication benefit. A weaker/cheaper model is exactly where context should
  separate from personas — that's the highest-value next run.
- **n = 4 manuscripts, 1 rep, 24 arm-runs.** Descriptive only — no CIs, no inference.
  Cells differ by a handful of gold issues; do not over-read small contrasts.
- **Judge = Claude (LLM-as-judge), not yet human-validated.** Self-judging risk; run
  `exp:packets` → human raters → κ before trusting the magnitudes.
- **3 of 4 manuscripts were authored for this run** (with planted-defect ledgers),
  so authoring bias is possible; the diabetes anchor is the only "found" case.
- **Context arm = reporting-checklist grounding only** (no protocol-diff handed over,
  empty prior-review corpus). That's a deliberately conservative slice of the full
  product grounding, chosen so gate recall stays a fair test rather than a tautology.
- **Concurrency was 2** (4-core box) and strict JSON schemas triggered repair
  retries; this is why scale was capped at 1 rep. The harness runs at the planned
  scale on a faster box or via the API path.

## How to harden this

Re-run on a cheaper base model (where hallucination > 0), add manuscripts + reps,
validate the judge against humans, and fit the GLMMs in `scripts/experiment/analyze.R`.
Everything needed is wired: `exp:seed-corpus → exp:keys → exp:manifest →` workflow `→
analyze-pilot` (or the full `exp:run/judge` path once a provider key exists).
