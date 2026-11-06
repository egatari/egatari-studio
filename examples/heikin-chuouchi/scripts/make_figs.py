# /// script
# requires-python = ">=3.12"
# dependencies = ["matplotlib>=3.9"]
# ///
"""Figures for the book (images/*.svg), drawn from data/*.json written by make_data.py.

Run from the deck folder after make_data.py:  uv run scripts/make_figs.py
Text is converted to paths so the SVG shows the same on every machine.
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA, IMG = ROOT / "data", ROOT / "images"
IMG.mkdir(exist_ok=True)
plt.rcParams.update({
    "font.family": ["Hiragino Sans", "Noto Sans CJK JP", "IPAexGothic", "sans-serif"],
    "font.size": 13, "svg.fonttype": "path", "axes.spines.top": False, "axes.spines.right": False,
    "svg.hashsalt": "egatari-heikin",
})
INK, ACC, ACC2, GREY = "#1f3a68", "#b0413e", "#7a5a00", "#8a8580"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def save(fig, name):
    fig.tight_layout()
    fig.savefig(IMG / name, metadata={"Date": None})
    plt.close(fig)


ch1 = load("ch1.json")
X = ch1["x"]


def sum_abs(xs, c):
    return sum(abs(x - c) for x in xs)


def sum_sq(xs, c):
    return sum((x - c) ** 2 for x in xs)


grid = [k / 20 for k in range(0, 281)]

# fig: absolute sum (polyline) -----------------------------------------------
fig, ax = plt.subplots(figsize=(4.6, 3.4))
ax.plot(grid, [sum_abs(X, c) for c in grid], color=INK, lw=2)
ax.axvline(ch1["median"], color=ACC, ls="--", lw=1.5)
ax.annotate(f"中央値 {ch1['median']}", (ch1["median"], ch1["sum_abs_at_median"]), xytext=(6.2, 30), color=ACC,
            arrowprops={"arrowstyle": "->", "color": ACC})
ax.plot(X, [0.6] * len(X), "o", color=GREY, ms=5, clip_on=False)
ax.set(xlabel="代表値 c（分）", ylabel="ズレの絶対値の和", xlim=(0, 14), ylim=(0, 42))
ax.margins(0.05)
save(fig, "abs-sum.svg")

# fig: squared sum (parabola) ------------------------------------------------
fig, ax = plt.subplots(figsize=(4.6, 3.4))
ax.plot(grid, [sum_sq(X, c) for c in grid], color=INK, lw=2)
ax.axvline(ch1["mean"], color=ACC, ls="--", lw=1.5)
ax.annotate(f"平均 {ch1['mean']}", (ch1["mean"], ch1["sum_sq_at_mean"]), xytext=(7.5, 250), color=ACC,
            arrowprops={"arrowstyle": "->", "color": ACC})
ax.plot(X, [8] * len(X), "o", color=GREY, ms=5, clip_on=False)
ax.set(xlabel="代表値 c（分）", ylabel="ズレの二乗の和", xlim=(0, 14), ylim=(0, 400))
save(fig, "sq-sum.svg")

# fig: outlier moves (two images, shown side by side in the book) -----------
moves = ch1["outlier_moves"]
g2 = [k / 10 for k in range(0, 351)]
styles = [(GREY, ":"), (ACC2, "--"), (INK, "-")]
for name, fn, key_c, key_v, ylab, ylim in [
    ("outlier-abs.svg", sum_abs, "median", "min_sum_abs", "絶対値の和", 80),
    ("outlier-sq.svg", sum_sq, "mean", "min_sum_sq", "二乗の和", 1200),
]:
    fig, ax = plt.subplots(figsize=(4.6, 3.4))
    for mv, (col, ls) in zip(moves, styles):
        Y = X[:-1] + [mv["outlier"]]
        ax.plot(g2, [fn(Y, c) for c in g2], color=col, ls=ls, lw=2, label=f"外れ値 {mv['outlier']}")
        ax.plot([mv[key_c]], [mv[key_v]], "o", color=col)
    ax.set(xlabel="代表値 c", ylabel=ylab, xlim=(0, 35), ylim=(0, ylim))
    ax.legend(frameon=False, fontsize=11)
    save(fig, name)

# fig: newsvendor (three weightings) -----------------------------------------
ch2 = load("ch2.json")
news = load("curve_news.json")
cols = {"重さが等しい": GREY, "廃棄を嫌う": INK, "品切れを嫌う": ACC}
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for s, cs in zip(news, ch2["cases"]):
    q, v = zip(*s["pts"])
    ax.plot(q, v, color=cols[s["label"]], lw=2, label=f"{s['label']}（余る {cs['over']} 円・足りない {cs['under']} 円）")
    b = cs["best_q"]
    ax.plot(b, [cs["best_loss_per_day"]] * len(b), "o", color=cols[s["label"]])
ax.set(xlabel="仕入れ数 q（個）", ylabel="1 日あたりの損（円）", xlim=(25, 55), ylim=(0, 3200))
ax.legend(frameon=False, fontsize=11, loc="upper center")
save(fig, "newsvendor.svg")
print("wrote", sorted(p.name for p in IMG.glob("*.svg")))
