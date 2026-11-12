"""Slide 23: weekly practice hours vs long-jump record, fictional track club (15 members)."""
import json, pathlib, random, statistics as st

rng = random.Random(23)
pts = []
for i in range(15):
    x = round(rng.uniform(2, 12) * 2) / 2               # hours/week, 0.5 steps
    y = round(3.6 + 0.13 * x + rng.gauss(0, 0.25), 2)    # metres
    pts.append([x, y])
pts.sort()
xs, ys = [p[0] for p in pts], [p[1] for p in pts]
mx, my = st.mean(xs), st.mean(ys)
sxy = sum((a - mx) * (b - my) for a, b in pts)
sxx = sum((a - mx) ** 2 for a in xs)
syy = sum((b - my) ** 2 for b in ys)
slope = sxy / sxx
icpt = my - slope * mx
r = sxy / (sxx * syy) ** 0.5
assert -1 <= r <= 1
data = {"series": [{"label": "部員 15 人", "points": pts}],
        "trend": {"fit": "linear", "label": "傾向（r = {r}）", "digits": 2},
        "_check": {"n": len(pts), "r": round(r, 2), "slope": round(slope, 3), "intercept": round(icpt, 2),
                   "xmin": min(xs), "xmax": max(xs), "ymin": min(ys), "ymax": max(ys),
                   "slope_per_hour_cm": round(slope * 100, 1)}}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "scatter.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"], ensure_ascii=False)); print(pts)
