# Persona-vs-Context Review — Pilot Results

Base model: **Claude** (held constant across all arms). Manuscripts: 4. Arm-runs scored: 48. Reps per cell: ~2.

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
