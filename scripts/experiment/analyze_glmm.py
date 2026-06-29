#!/usr/bin/env python3
"""Mixed-effects analysis for the persona-vs-context factorial, pooled across trials.

  python3 scripts/experiment/analyze_glmm.py results1.json manifest1.json [results2.json manifest2.json ...]

Issue-level logistic model: detected ~ personaA * contextB, with manuscript-clustered
robust SEs (primary) and a Bayesian mixed GLM with manuscript+gold random intercepts
(sensitivity). Reports odds ratios + 95% CIs for the persona main effect, the context
main effect, the interaction, and the H4 (persona vs matched ensemble) contrast.
"""
import json
import sys
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

pairs = sys.argv[1:]
assert len(pairs) % 2 == 0 and pairs, "pass (results.json manifest.json) pairs"

# gold_id -> layer, keyed by manuscript
layer = {}
rows = []
for i in range(0, len(pairs), 2):
    res = json.load(open(pairs[i]))
    man = json.load(open(pairs[i + 1]))
    for mid, m in man["manuscripts"].items():
        for g in m["gold"]:
            layer[(mid, g["id"])] = g["layer"]
    for r in res:
        pg = r.get("verdict", {}).get("per_gold", [])
        for g in pg:
            rows.append({
                "manuscript": r["mid"], "arm": r["arm"], "rep": r["rep"],
                "gold_id": g["gold_id"], "layer": layer.get((r["mid"], g["gold_id"]), "?"),
                "detected": 1 if g["detected"] else 0,
            })

df = pd.DataFrame(rows)
df["personaA"] = df["arm"].isin(["persona", "persona_context"]).astype(int)
df["contextB"] = df["arm"].isin(["context", "persona_context"]).astype(int)
fac = df[df["arm"].isin(["naive", "persona", "context", "persona_context"])].copy()

n_ms = df["manuscript"].nunique()
print(f"Pooled: {n_ms} manuscripts, {len(df)} issue-level obs "
      f"({df['gold_id'].nunique()} distinct gold ids), arms={sorted(df['arm'].unique())}\n")


def or_table(model, terms):
    p = model.params
    ci = model.conf_int()
    out = []
    for t in terms:
        if t in p.index:
            out.append((t, np.exp(p[t]), np.exp(ci.loc[t, 0]), np.exp(ci.loc[t, 1]), model.pvalues[t]))
    return out


def fit_cluster(data, formula="detected ~ personaA * contextB"):
    return smf.glm(formula, data=data, family=sm.families.Binomial()).fit(
        cov_type="cluster", cov_kwds={"groups": data["manuscript"]})


def show(title, rows):
    print(title)
    print(f"  {'term':<26s}{'OR':>8s}{'95% CI':>20s}{'p':>10s}")
    for t, orr, lo, hi, pv in rows:
        print(f"  {t:<26s}{orr:>8.2f}   [{lo:>5.2f}, {hi:>5.2f}]   {pv:>8.3f}")
    print()


print("=" * 64)
print("PRIMARY: issue-level recall, all gold (cluster-robust by manuscript)")
print("=" * 64)
m_all = fit_cluster(fac)
show("detected ~ personaA * contextB", or_table(m_all, ["personaA", "contextB", "personaA:contextB"]))

gate = fac[fac["layer"] == "gate"]
if len(gate) and gate["arm"].nunique() >= 2:
    print("=" * 64)
    print("PRIMARY metric: gate-layer recall")
    print("=" * 64)
    show("detected ~ personaA * contextB  (gate layer)",
         or_table(fit_cluster(gate), ["personaA", "contextB", "personaA:contextB"]))

print("=" * 64)
print("H4: persona vs matched ensemble (does persona beat plain ensembling?)")
print("=" * 64)
for ctx, pa, en in [("context OFF", "persona", "ensemble_naive"), ("context ON", "persona_context", "ensemble_context")]:
    d = df[df["arm"].isin([pa, en])].copy()
    if d["arm"].nunique() < 2:
        print(f"  {ctx}: insufficient data"); continue
    d["is_persona"] = (d["arm"] == pa).astype(int)
    mm = fit_cluster(d, "detected ~ is_persona")
    show(f"{ctx}: detected ~ is_persona  (OR≈1 ⇒ persona == ensemble)",
         or_table(mm, ["is_persona"]))

# Sensitivity: Bayesian mixed GLM with manuscript + gold random intercepts
try:
    from statsmodels.genmod.bayes_mixed_glm import BinomialBayesMixedGLM
    fac2 = fac.copy()
    vc = {"ms": "0 + C(manuscript)", "gold": "0 + C(gold_id)"}
    bm = BinomialBayesMixedGLM.from_formula("detected ~ personaA * contextB", vc, fac2).fit_vb()
    print("=" * 64)
    print("SENSITIVITY: Bayesian mixed GLM (random intercepts: manuscript + gold)")
    print("=" * 64)
    fe = [n for n in bm.model.exog_names]
    for i, n in enumerate(fe):
        if n in ("personaA", "contextB", "personaA:contextB"):
            mean = bm.fe_mean[i]; sd = bm.fe_sd[i]
            print(f"  {n:<26s} OR {np.exp(mean):>6.2f}  [{np.exp(mean-1.96*sd):>5.2f}, {np.exp(mean+1.96*sd):>5.2f}]")
    print()
except Exception as e:  # noqa
    print(f"(Bayesian mixed GLM skipped: {e})\n")

print("Reading: persona OR ~1 (CI spans 1) ⇒ persona adds nothing; context OR>1 ⇒ grounding "
      "helps; interaction ~1 ⇒ no rescue; H4 is_persona OR ~1 (or <1) ⇒ persona = ensembling "
      "(or worse).")
