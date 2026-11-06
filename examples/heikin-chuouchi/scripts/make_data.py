# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Numbers for the book and slides 「平均と中央値は「ズレの測り方」で決まる」.

Run from the deck folder:  uv run scripts/make_data.py
Writes data/*.json. Every number quoted in article/*.md and deck.html comes from here.

- Chapter 1 uses a tiny fictional data set (5 waiting times, minutes; labelled 架空).
- Section 1.2 quotes official figures (総務省統計局 家計調査 貯蓄・負債編 2025年平均,
  二人以上の世帯, published 2026-05-19). They are typed in from the primary source
  (2025_gai.pdf p.1-2); the script only derives differences and ratios from them.
- Chapter 2 uses a fictional sales record generated with a fixed seed (labelled 架空).
"""
import json
import random
from fractions import Fraction
from pathlib import Path
from statistics import mean, median

OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def r(v, d=4):
    v = round(float(v), d)
    return int(v) if v == int(v) else v


def sum_abs(xs, c):
    return sum(abs(x - c) for x in xs)


def sum_sq(xs, c):
    return sum((x - c) ** 2 for x in xs)


# ---------------------------------------------------------------- chapter 1
X = [2, 4, 5, 7, 12]          # 架空：5 日間に駅で電車を待った時間（分）
n = len(X)
xbar = Fraction(sum(X), n)
med = median(X)
ss_min = sum_sq(X, xbar)      # = sum (x - xbar)^2
var = ss_min / n
ch1 = {
    "note": "架空のデータ（5 日間の待ち時間、分）",
    "x": X, "n": n, "mean": r(xbar), "median": med,
    "sum_abs_at_median": r(sum_abs(X, med)), "sum_abs_at_mean": r(sum_abs(X, xbar)),
    "sum_sq_at_mean": r(ss_min), "sum_sq_at_median": r(sum_sq(X, med)),
    "variance": r(var),
    # completing the square: sum (x-c)^2 = n (c - xbar)^2 + ss_min
    "square_form": f"{n}(c-{r(xbar)})^2 + {r(ss_min)}",
    # slope of sum|x-c| on each open interval between data points: (#left) - (#right)
    "abs_slopes": [
        {"from": a, "to": b, "slope": sum(x < (a + b) / 2 for x in X) - sum(x > (a + b) / 2 for x in X)}
        for a, b in zip([0] + X, X + [14])
    ],
}
# check the identity on a grid
for c in [Fraction(k, 4) for k in range(0, 57)]:
    assert sum_sq(X, c) == n * (c - xbar) ** 2 + ss_min

# outlier sweep: move the largest value 12 -> 22 -> 32
moves = []
for big in [12, 22, 32]:
    Y = X[:-1] + [big]
    m = Fraction(sum(Y), n)
    moves.append({"outlier": big, "mean": r(m), "median": median(Y),
                  "min_sum_sq": r(sum_sq(Y, m)), "min_sum_abs": r(sum_abs(Y, median(Y)))})
ch1["outlier_moves"] = moves
dump("ch1.json", ch1)
dump("sweep_values.json", [mv["outlier"] for mv in moves])

# m-curves series (pts are exact; the abs curve is piecewise linear, so data points are breakpoints)
grid = [k / 4 for k in range(0, 57)]          # c = 0 .. 14
abs_pts = [[c, r(sum_abs(X, c))] for c in sorted(set([0, 14] + X))]
sq_pts = [[c, r(sum_sq(X, c))] for c in grid]
dump("curve_abs.json", [
    {"label": "絶対値の和", "pts": abs_pts, "tone": "term", "step": 1, "labelAt": 11, "anchor": "left"},
    {"label": f"中央値 {med}", "pts": [[med, 0], [med, r(sum_abs(X, med))]], "tone": "emph", "dash": True,
     "step": 2, "anchor": "right", "ly": 4},
])
dump("curve_sq.json", [
    {"label": "二乗の和", "pts": sq_pts, "tone": "term", "step": 1, "labelAt": 12, "anchor": "left"},
    {"label": f"平均 {r(xbar)}", "pts": [[float(xbar), 0], [float(xbar), r(ss_min)]], "tone": "emph", "dash": True,
     "step": 2, "anchor": "right", "ly": 15},
])
# loss of a single deviation u, for slide 3
dump("curve_loss_shapes.json", [
    {"label": "絶対値 |*u*|", "f": "abs(x)", "tone": "term", "step": 1, "labelAt": -3, "anchor": "right", "ly": 3.6},
    {"label": "二乗 *u*^2", "f": "x*x", "tone": "accent2", "step": 2, "labelAt": 2.1, "anchor": "right"},
])

# ---------------------------------------------------------------- section 1.2 (official figures)
# Source: 総務省統計局「家計調査報告（貯蓄・負債編）－2025年（令和7年）平均結果－（二人以上の世帯）」
#   2026-05-19, https://www.stat.go.jp/data/sav/sokuhou/nen/pdf/2025_gai.pdf  p.1 (Ⅰ-1(1)), p.2 (図Ⅰ-1-3)
SAV = {
    "survey": "家計調査（貯蓄・負債編）2025年平均、二人以上の世帯",
    "published": "2026-05-19",
    "unit": "万円",
    "mean": 2059,                    # 貯蓄現在高の平均値（0 の世帯を含む）
    "median_holders": 1264,          # 貯蓄保有世帯の中央値（0 の世帯を除く）
    "median_all_reference": 1167,    # 0 の世帯を含めた中央値（参考値）
    "share_below_mean_pct": 66.1,    # 平均値を下回る世帯の割合
}
SAV["mean_minus_median_all"] = SAV["mean"] - SAV["median_all_reference"]
SAV["mean_over_median_all"] = r(SAV["mean"] / SAV["median_all_reference"], 2)
SAV["median_all_over_mean"] = r(SAV["median_all_reference"] / SAV["mean"], 3)
dump("savings.json", SAV)
dump("bars_savings.json", {"groups": [
    {"label": "平均値", "value": SAV["mean"], "step": 1},
    {"label": "中央値\n（参考値）", "value": SAV["median_all_reference"], "step": 2, "tone": "emph"},
]})

# ---------------------------------------------------------------- chapter 2 (fictional sales)
rng = random.Random(20261031)
DAYS = 20
sales = [max(0, round(rng.gauss(40, 8))) for _ in range(DAYS)]   # 架空：おにぎりの 1 日の販売数
srt = sorted(sales)


def news_loss(q, over, under, ds=sales):
    """average loss per day (yen) when stocking q: over per unsold unit, under per missed sale."""
    return Fraction(sum(over * max(q - d, 0) + under * max(d - q, 0) for d in ds), len(ds))


CASES = [
    {"key": "equal", "name": "重さが等しい", "over": 100, "under": 100},
    {"key": "waste", "name": "廃棄を嫌う", "over": 100, "under": 50},
    {"key": "stockout", "name": "品切れを嫌う", "over": 100, "under": 200},
]
qs = list(range(25, 56))
for cs in CASES:
    losses = {q: news_loss(q, cs["over"], cs["under"]) for q in qs}
    best = min(losses.values())
    cs["best_q"] = [q for q in qs if losses[q] == best]
    cs["best_loss_per_day"] = r(best, 1)
    cs["critical_ratio"] = r(Fraction(cs["under"], cs["over"] + cs["under"]), 4)
    # empirical check: at an optimal q, share of days with d < q is <= ratio <= share with d <= q
    q0 = cs["best_q"][0]
    lo = Fraction(sum(d < q0 for d in sales), DAYS)
    hi = Fraction(sum(d <= q0 for d in sales), DAYS)
    assert lo <= Fraction(cs["under"], cs["over"] + cs["under"]) <= hi, cs
    cs["share_below"] = r(lo, 4)
    cs["share_at_or_below"] = r(hi, 4)
    cs["pts"] = [[q, r(losses[q], 1)] for q in qs]
ch2 = {
    "note": "架空の販売記録（20 日分、個）。scripts/make_data.py が乱数の種 20261031 で作る",
    "sales": sales, "sorted": srt, "days": DAYS,
    "mean": r(mean(sales), 2), "median": median(sales), "min": min(sales), "max": max(sales),
    "price": 150, "cost": 100, "profit": 50,
    "cases": [{k: v for k, v in cs.items() if k != "pts"} for cs in CASES],
}
dump("ch2.json", ch2)
tones = {"equal": "muted", "waste": "term", "stockout": "accent2"}
# label positions chosen so the three names do not collide (the curves meet at the right end)
label_pos = {"equal": (30, "above"), "waste": (31, "below"), "stockout": (26, "right")}
series = []
for i, cs in enumerate(CASES):
    at, anchor = label_pos[cs["key"]]
    series.append({"label": cs["name"], "pts": cs["pts"], "tone": tones[cs["key"]], "step": i + 1,
                   "labelAt": at, "anchor": anchor})
dump("curve_news.json", series)
# asymmetric single-day loss shape (slide): over 100 yen per unsold unit, under 50 yen per missed sale
dump("curve_pinball.json", [
    {"label": "余る損（1 個 100 円）", "f": "x > 0 ? 100*x : 0", "tone": "term", "step": 1, "labelAt": 2.2, "anchor": "left"},
    {"label": "足りない損（1 個 50 円）", "f": "x < 0 ? -50*x : 0", "tone": "accent2", "step": 2, "labelAt": -3, "anchor": "right"},
])

# ---------------------------------------------------------------- exercises
E1 = [1, 3, 4, 8, 9]
E2 = [3, 5, 10]
E3 = [2, 4, 6, 9]
e2m = Fraction(sum(E2), len(E2))
ex = {
    "ex1": {"x": E1, "median": median(E1), "mean": r(mean(E1)), "sum_abs_at_median": r(sum_abs(E1, median(E1))),
            "sum_abs_at_mean": r(sum_abs(E1, mean(E1)))},
    "ex2": {"x": E2, "mean": r(e2m), "min_sum_sq": r(sum_sq(E2, e2m)), "form": f"3(c-{r(e2m)})^2 + {r(sum_sq(E2, e2m))}"},
    "ex3": {"x": E3, "flat_from": 4, "flat_to": 6, "value_on_flat": r(sum_abs(E3, 5)),
            "check": [r(sum_abs(E3, c)) for c in (4, 5, 6)]},
    "ex4": {"over": 60, "under": 90, "ratio": r(Fraction(90, 150))},
}
_l4 = {q: news_loss(q, 60, 90) for q in qs}
ex["ex4"]["best_q"] = [q for q in qs if _l4[q] == min(_l4.values())]
assert len(set(ex["ex3"]["check"])) == 1
dump("exercises.json", ex)
print(json.dumps({"ch1": {k: ch1[k] for k in ("mean", "median", "sum_abs_at_median", "sum_sq_at_mean", "variance")},
                  "moves": moves, "sav": SAV, "ch2": {k: ch2[k] for k in ("sales", "sorted", "mean", "median")},
                  "cases": ch2["cases"], "ex": ex}, ensure_ascii=False, indent=1))
