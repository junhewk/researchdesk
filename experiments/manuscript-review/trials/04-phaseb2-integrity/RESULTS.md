# Phase B-2 — Stat-impossibility battery + tortured-phrase lexicon

Base model: **qwen3.6-27b-mtp-q8** (local). Judge: **Claude** (blinded). 3 manuscripts ×
4 arms × 2 reps = 24 arm-runs. 11 tool-confirmed planted errors. The grounding pack is
**computed** by `scripts/experiment/lib/integrity.mjs` (GRIM, statcheck, tortured/AI scanner)
— not hand-written — so `grounded` reflects a real tool, not an oracle.

## Detection rate by check type (1.00 = always caught)

| Check | naive | persona | ensemble | **grounded** | Does grounding add value? |
|---|---|---|---|---|---|
| **GRIM** (impossible mean) | 0.00 | 0.00 | 0.00 | **1.00** | **Categorical (+1.00)** — only grounding catches it |
| statcheck (p vs recompute) | 0.67 | 1.00 | 1.00 | 1.00 | **Redundant (+0.00)** — model recomputes it itself |
| tortured phrase | 1.00 | 1.00 | 1.00 | 1.00 | **Redundant (+0.00)** |
| AI-generated boilerplate | 1.00 | 1.00 | 1.00 | 1.00 | **Redundant (+0.00)** |

## What this says — and you were right about the phrase list

1. **The tortured-phrase / AI-tell lexicon does *not* help detection.** Every arm — including
   plain `naive` — flagged "profound learning" / "bolster vector machine" / "arbitrary
   woodland" on its own, as *"non-standard terminology, the field uses …"*, and flagged the
   verbatim *"As an AI language model, I cannot access real-time data"* as boilerplate. The
   model catches the weird prose by **reading** it; it doesn't need a dictionary. As a
   *detector*, the lexicon is redundant. Your skepticism holds.
   - Its only genuine value-add is **interpretation/labeling**: the model says "awkward
     wording"; the lexicon says "this is a paper-mill paraphraser fingerprint / AI text" —
     which changes the *action* (desk-reject / integrity flag vs. a copyedit). Useful for an
     editor's decision, not for finding the issue. And it gives consistency at scale. But it
     does not surface anything review would otherwise miss.

2. **statcheck is mostly redundant too.** A model with reasonable statistical sense flags
   "t=1.2 can't give p=0.004" and "F=1.5 isn't significant" by itself (naive already at 0.67,
   the ensemble at 1.00 — one ensemble reviewer even reconstructed the recomputation by hand).
   Grounding raises the floor (0.67→1.00, i.e. reliability) but adds no new *category*.

3. **GRIM is the one real categorical win.** Whether a reported mean is arithmetically
   possible for the stated N and scale requires modular arithmetic the model cannot do in its
   head — so naive/persona/ensemble are at **0.00** and only `grounded` catches it (1.00).
   This is the same shape as a fabricated DOI: a check the model is *structurally incapable*
   of, not merely *uninstructed* about.

## The principle this nails down (the real contribution)

Grounding earns its keep **only where the model is structurally incapable**, not where it is
merely uninstructed:

| Structurally incapable → grounding is categorical | Already capable → grounding is redundant |
|---|---|
| Does this DOI exist / is it retracted? (Phase B) | Is this phrasing odd / non-standard? (tortured) |
| What did the registered protocol say? (Phase B) | Is this AI boilerplate? (AI-tell) |
| Is this mean arithmetically possible? (GRIM) | Is t=1.2, p=0.004 inconsistent? (statcheck — mostly) |

So of the items tested: **keep GRIM** (and the Phase-B protocol/citation checks) — they catch
what review cannot. **Drop the tortured-phrase lexicon as a detector** (optionally keep it as
a cheap *labeler* for integrity triage). statcheck is worth keeping for *reliability* but it is
not a categorical differentiator.

## Caveats
3 manuscripts × 2 reps; descriptive. Judge = Claude (stronger than the qwen generator), so the
arms' "self-catch" of statcheck/tortured may be *more* generous than a weaker judge would score
— which only strengthens the "lexicon is redundant" conclusion. The redundancy verdict is about
*detection on these planted cases*, not about real-world base rates of paper-mill text.
