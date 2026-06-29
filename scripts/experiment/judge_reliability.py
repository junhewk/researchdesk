#!/usr/bin/env python3
"""Cross-judge (test-retest) reliability: Cohen's kappa between the original and a
second independent Claude judge pass on a subset of arm-runs, paired per gold issue.

  python3 scripts/experiment/judge_reliability.py original_results.json rejudge.json
"""
import json
import sys

orig = json.load(open(sys.argv[1]))
rej = json.load(open(sys.argv[2]))


def index(arr):
    d = {}
    for r in arr:
        key = (r["mid"], r["arm"], r["rep"])
        for g in r.get("verdict", {}).get("per_gold", []):
            d[(*key, g["gold_id"])] = 1 if g["detected"] else 0
    return d


a, b = index(orig), index(rej)
keys = sorted(set(a) & set(b))
n = len(keys)
if n == 0:
    print("no overlapping (run, gold) pairs"); sys.exit(1)

agree = sum(1 for k in keys if a[k] == b[k])
# Cohen's kappa
yes1 = sum(a[k] for k in keys) / n
yes2 = sum(b[k] for k in keys) / n
pe = yes1 * yes2 + (1 - yes1) * (1 - yes2)
po = agree / n
kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0

# also: how often the two passes give the same per-run recall
print(f"Cross-judge reliability (original vs independent re-judge)")
print(f"  paired (run x gold) decisions: {n}  across {len({(k[0],k[1],k[2]) for k in keys})} runs")
print(f"  raw agreement: {po:.3f}")
print(f"  Cohen's kappa: {kappa:.3f}   ({'almost perfect' if kappa>=0.8 else 'substantial' if kappa>=0.6 else 'moderate' if kappa>=0.4 else 'fair/low'})")
print(f"  base rate detected: judge1 {yes1:.2f}, judge2 {yes2:.2f}")
