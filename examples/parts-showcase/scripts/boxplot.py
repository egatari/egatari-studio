"""Slide 25: waiting time (minutes) at the counter of three fictional shops, 15 customers each.
Quartiles by the Japanese textbook method (median of the lower / upper half, median excluded when n is odd)."""
import json, pathlib, random, statistics as st

def five_jp(v):
    s = sorted(v); n = len(s); h = n // 2
    lo, hi = s[:h], s[h + (n % 2):]
    return [s[0], st.median(lo), st.median(s), st.median(hi), s[-1]]

rng = random.Random(25)
spec = [("駅前店", 9, 3.0), ("本町店", 6, 1.5), ("郊外店", 12, 5.0)]
groups, check = [], {}
for name, mu, sd in spec:
    v = [max(1, round(rng.gauss(mu, sd))) for _ in range(15)]
    groups.append({"label": name, "values": v})
    f = five_jp(v)
    check[name] = {"five": f, "iqr": f[3] - f[1], "range": f[4] - f[0], "sorted": sorted(v)}
data = {"groups": groups, "_check": check}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "boxplot.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(check, ensure_ascii=False, indent=1))
