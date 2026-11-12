"""Fictional monthly visitors of three shops over 12 months (m-curves, slide 07)."""
import json, math
from pathlib import Path

months = list(range(1, 13))
def series(start, growth, season):
    # visitors in 百人: linear trend + seasonal swing
    return [round(start + growth * (m - 1) + season * math.sin((m - 1) / 12 * 2 * math.pi), 1) for m in months]
shops = {
    "駅前店": series(42, 0.2, 4),
    "郊外店": series(30, 1.6, 2),
    "商店街店": series(38, -0.9, 3),
}
out = {"unit": "百人", "months": months,
       "series": [{"label": k, "pts": [[m, v] for m, v in zip(months, vs)]} for k, vs in shops.items()],
       "first": {k: vs[0] for k, vs in shops.items()}, "last": {k: vs[-1] for k, vs in shops.items()}}
Path(__file__).resolve().parent.parent.joinpath("data", "curves.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out["first"], out["last"], min(min(v for _, v in s["pts"]) for s in out["series"]), max(max(v for _, v in s["pts"]) for s in out["series"]))
