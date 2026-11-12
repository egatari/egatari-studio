"""Fictional quarterly figures: orders, average price, satisfaction (m-kpi, slide 10)."""
import json
from pathlib import Path

prev = {"orders": 1180, "price": 4.6, "csat": 4.3}
curr = {"orders": 1352, "price": 4.2, "csat": 4.5}
out = {"prev": prev, "curr": curr, "cards": [
    {"label": "受注件数", "value": curr["orders"], "unit": "件",
     "diff": curr["orders"] - prev["orders"], "pct": round(100 * (curr["orders"] - prev["orders"]) / prev["orders"], 1)},
    {"label": "平均単価", "value": curr["price"], "unit": "万円",
     "diff": round(curr["price"] - prev["price"], 1)},
    {"label": "顧客満足度", "value": curr["csat"], "unit": "/ 5",
     "diff": round(curr["csat"] - prev["csat"], 1)},
]}
Path(__file__).resolve().parent.parent.joinpath("data", "kpi.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
