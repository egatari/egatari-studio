"""Slide 24: one-way commute time (minutes) of 60 fictional employees; right-skewed."""
import json, pathlib, random, statistics as st

rng = random.Random(24)
vals = []
while len(vals) < 60:
    v = round(rng.lognormvariate(3.3, 0.5))
    if 5 <= v < 120:
        vals.append(v)
mean, med = st.mean(vals), st.median(vals)
assert mean > med
counts = {}
for v in vals:
    b = (v // 10) * 10
    counts[b] = counts.get(b, 0) + 1
data = {"values": vals, "bins": {"start": 0, "width": 10},
        "_check": {"n": len(vals), "mean": round(mean, 1), "median": med, "min": min(vals), "max": max(vals),
                   "counts": dict(sorted(counts.items()))}}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "hist.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"], ensure_ascii=False))
