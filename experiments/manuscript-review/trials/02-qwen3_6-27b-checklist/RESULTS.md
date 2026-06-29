# Persona-vs-Context Review — Pilot Results

Base model: **qwen3.6-27b-mtp-q8 (local llama-server)** (held constant across all arms). Manuscripts: 4. Arm-runs scored: 48. Reps per cell: ~2.

Ground truth = deterministic readiness gates + reporting-checklist gaps + a curated planted-defect ledger. Comments were blind-judged (arm identity stripped, order hashed).

| Metric | naive | persona | context | persona_context | ens_naive | ens_context |
|---|---|---|---|---|---|---|
| Recall (all gold) | 0.38 | 0.49 | 0.58 | 0.57 | 0.57 | 0.63 |
| Recall — gate (primary) | 0.03 | 0.05 | 0.29 | 0.26 | 0.32 | 0.31 |
| Recall — checklist | 0.61 | 0.85 | 0.90 | 0.86 | 0.76 | 0.92 |
| Recall — ledger (curated) | 0.72 | 0.80 | 0.78 | 0.80 | 0.78 | 0.84 |
| Precision (valid/items) | 1.00 | 0.99 | 1.00 | 1.00 | 1.00 | 1.00 |
| Hallucination rate | 0.03 | 0.04 | 0.04 | 0.00 | 0.00 | 0.01 |
| Specificity (0-2) | 1.88 | 1.86 | 1.92 | 1.93 | 1.81 | 1.91 |
| Actionability (0-2) | 1.95 | 1.97 | 2.00 | 2.00 | 2.00 | 1.99 |
| Comments per run | 5.5 | 8.4 | 6.9 | 8.6 | 7.4 | 8.5 |
| Redundancy (items/gold) | 0.80 | 0.90 | 0.74 | 0.91 | 0.72 | 0.83 |

## Factorial contrasts (2×2 cells)

| Metric | Persona main effect | Context main effect | Interaction | H4: persona−ensemble (ctx off / on) |
|---|---|---|---|---|
| Recall (all gold) | +0.05 | +0.14 | -0.12 | -0.08 / -0.07 |
| Recall — gate (primary) | +0.00 | +0.24 | -0.05 | -0.27 / -0.05 |
| Recall — checklist | +0.10 | +0.15 | -0.28 | +0.08 / -0.06 |
| Recall — ledger (curated) | +0.05 | +0.03 | -0.06 | +0.02 / -0.03 |
| Precision (valid/items) | -0.01 | +0.01 | +0.01 | -0.01 / +0.00 |
| Hallucination rate | -0.01 | -0.01 | -0.05 | +0.04 / -0.01 |
| Specificity (0-2) | -0.01 | +0.05 | +0.03 | +0.05 / +0.01 |
| Actionability (0-2) | +0.01 | +0.04 | -0.02 | -0.03 / +0.01 |
| Comments per run | +2.3 | +0.8 | -1.1 | +1.0 / +0.1 |
| Redundancy (items/gold) | +0.14 | -0.03 | +0.07 | +0.18 / +0.08 |

_Reading: context main effect should be **positive** for recall and **negative** for hallucination (H1); persona main effect near zero or adverse (H2); interaction near zero (H3); H4 persona−ensemble near zero ⇒ persona = ensembling, not expertise._

## Interpretation (weak base model)

This is the run that matters: on a small local model, the differences the strong-model
pilot hid become visible.

1. **Grounding now clearly helps coverage (the "context gives more" the strong model couldn't show).**
   Context main effect on recall is **+0.14** overall and **+0.24** on the primary gate
   metric. Concretely, `naive → context` lifts gate recall **0.03 → 0.29** and overall
   recall **0.38 → 0.58**. The weak model doesn't know the reporting standards by heart, so
   the injected checklist scaffolds it to catch issues it otherwise walks past. (On Claude
   this effect was ~0 — it already knew the standards.)

2. **Personas don't help, and on the hardest issues they hurt.** Persona main effect on gate
   recall is **0.00**, and the H4 control is damning: `persona − ensemble_naive = −0.27` on
   gate recall (persona 0.05 vs a plain 4-reviewer ensemble 0.32). Splitting the job into
   "statistician / methodologist / editor" lenses makes each reviewer miss the cross-cutting
   gate issues (ethics, data-availability, registration) that no single persona "owns."
   Personas also produced **3 of the 7 hallucinations** — the most of any arm.

3. **Ensembling is again an independent coverage lever** (`naive → ensemble_naive`: recall
   0.38 → 0.57, gate 0.03 → 0.32) — and it works *without* personas.

4. **Fabrication finally appears — and grounding+ensembling suppress it.** Overall
   hallucination is **1.9% (7/362)** vs ~0 on Claude. The ungrounded single arm (naive) sits
   at 0.03; the grounded **and** ensembled arms (`persona_context`, `ensemble_naive`,
   `ensemble_context`) are at **0.00–0.01**. Small N, but the direction is exactly the
   product's thesis.

5. **The best arm is `context + ensemble`** — `ensemble_context`: recall **0.63**, gate
   **0.31**, checklist **0.92**, hallucination **0.01**. This is direct evidence for the
   **context-grounded ensemble** architecture: grounding for correctness + coverage,
   ensembling for breadth, personas contributing nothing.

**Caveats:** n = 4 manuscripts × 2 reps (48 runs); descriptive, no CIs. Judge = Claude
(constant with trial 01); 3 manuscripts authored with planted ledgers. Generation used
grammar-constrained JSON (response_format json_schema) with Qwen3 instruct sampling; the
context arm is checklist-grounding only (no protocol-diff / validators yet — that's Phase B).
