"""Slide 26: Beta-Bernoulli updating of a lottery's win rate.
Prior Beta(1,1) (uniform). Fictional draw sequence; 1 = 当たり, 0 = はずれ."""
import json, pathlib, math

draws = [0, 1, 0, 0, 0, 1, 0, 0, 1, 0]
xs = [round(i / 50, 2) for i in range(51)]

def beta_pdf(x, a, b):
    if x <= 0 or x >= 1:
        if (x == 0 and a == 1) or (x == 1 and b == 1):
            return math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b))
        return 0.0
    return math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                    + (a - 1) * math.log(x) + (b - 1) * math.log(1 - x))

a, b = 1, 1
steps, table = [], []
def add(n, s, a, b, mark=None):
    mean = a / (a + b)
    dens = [round(beta_pdf(x, a, b), 4) for x in xs]
    # numeric check: density integrates to 1 (trapezoid)
    integ = sum((dens[i] + dens[i + 1]) / 2 * 0.02 for i in range(50))
    assert abs(integ - 1) < 0.01, integ
    st = {"dens": dens, "readout": {"回数": n, "当たり": s, "平均": round(mean, 2)}}
    steps.append(st)
    table.append({"n": n, "wins": s, "a": a, "b": b, "mean": round(mean, 3), "peak": max(dens)})
add(0, 0, a, b)
s = 0
for i, d in enumerate(draws, 1):
    s += d
    a, b = 1 + s, 1 + (i - s)
    add(i, s, a, b)
data = {"xs": xs, "steps": steps, "digits": {"回数": 0, "当たり": 0, "平均": 2},
        "_check": {"draws": draws, "table": table}}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "seq.json"
out.write_text(json.dumps(data, ensure_ascii=False))
for t in table: print(t)
