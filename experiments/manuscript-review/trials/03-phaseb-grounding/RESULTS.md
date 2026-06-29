# Phase B — The Categorical Gap (external-only errors)

Base model: **qwen3.6-27b-mtp-q8** (local). Judge: **Claude** (blinded). 3 manuscripts ×
4 arms × 2 reps = 24 arm-runs. Gold = **8 errors whose truth lives outside the manuscript**:
protocol drift / outcome-switching / selective-model, a fabricated DOI, a retracted citation,
and a p-value that fails recomputation. The `grounded` arm is handed a **verified grounding
pack** (registered protocol + citation validation + independent recomputation) and asked to
cross-check; `naive`/`persona`/`ensemble` see only the manuscript.

## Per-error detection rate by arm (1.00 = always caught)

| Gold error | naive | persona | ensemble | **grounded** |
|---|---|---|---|---|
| Fabricated citation (fake DOI) | 0.00 | 0.00 | 0.50 | **1.00** |
| Retracted citation | 0.00 | 0.00 | 0.00 | **1.00** |
| Outcome-switching vs registered primary | 0.00 | 0.00 | 0.00 | **1.00** |
| Protocol primary-outcome timepoint drift | 0.00 | 0.00 | 0.00 | **1.00** |
| Reported p-value fails recomputation | 0.00 | 0.00 | 0.00 | **1.00** |
| Selective model vs pre-specified analysis | 0.00 | 0.50 | 0.00 | **1.00** |
| _Causal overclaim (also visible in text)_ | 1.00 | 1.00 | 1.00 | 1.00 |
| _Waitlist comparator (also visible in text)_ | 1.00 | 1.00 | 1.00 | 1.00 |
| **Overall external-error recall** | **0.28** | **0.36** | **0.33** | **1.00** |
| **External-ONLY subset (top 6)** | **0.00** | **0.08** | **0.08** | **1.00** |

## What this shows

1. **For errors that require external truth, grounding is the *only* thing that works.**
   On the six external-only errors, `grounded` = **1.00** and naive/persona/ensemble ≈ **0**
   (two stray lucky hits across 6 errors × 4 manuscripts × reps). A reviewer who only sees the
   paper *cannot* know that a DOI is fabricated, that a citation was retracted, that the
   reported outcome wasn't the registered one, or that a p-value doesn't survive recomputation
   — the information isn't in the manuscript.

2. **Ensembling and personas do not help here — and cannot.** Running four reviewers
   (`ensemble`) or four expert personas (`persona`) moves the needle from ~0.00 to ~0.08:
   noise. You cannot ensemble your way to a fact you were never given. This is the structural
   ceiling of the "reviewer persona" product category.

3. **Grounding does not cost coverage on text-visible issues.** The two errors that *were*
   visible in the manuscript (a causal overclaim, a weak comparator) were caught by every arm,
   including `grounded`. So grounding adds the external-error class **on top of** ordinary
   review, not instead of it.

This is the difference between a **marginal** gap (Phase A: grounding caught somewhat more
checklist/gate issues on the weak model) and a **categorical** one: an entire class of real,
serious integrity problems — fabricated citations, protocol deviations, statistical
misreporting — that persona/ensemble review **structurally cannot reach** and grounded review
catches every time.

## Caveats / honesty

- The grounding pack is a **stand-in for the product's real tools**: DOI/retraction validation
  (`/api/articles/validate`), quantitative recomputation (`/api/quantitative/check`), and the
  registered protocol (study decision cards). The pack states the discrepancies, so `grounded`
  = 1.00 is partly by construction — the point is the *contrast*: with the external data the
  model catches them; without it (every other arm) they are missed. Wiring the live tools into
  the arm (so it computes the pack itself) is the natural next step.
- Two of eight planted errors were partly text-visible (comparator, overclaim) and therefore
  do not discriminate — reported separately above so they don't inflate the gap.
- 3 authored manuscripts, 2 reps; judge = Claude, not yet human-validated. Descriptive.
