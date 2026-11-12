"""Fictional monthly sales by branch (m-bars, slide 02)."""
import json, random
from pathlib import Path

random.seed(2)
branches = ["本店", "駅前店", "北店", "南店", "空港店"]
# base sales in 万円, plus a small seeded variation
base = [820, 1240, 610, 700, 540]
groups = [{"label": b, "value": v + random.randint(-40, 40)} for b, v in zip(branches, base)]
top = max(groups, key=lambda g: g["value"])
out = {"unit": "万円", "groups": groups, "top": top["label"], "total": sum(g["value"] for g in groups)}
Path(__file__).resolve().parent.parent.joinpath("data", "bars.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
