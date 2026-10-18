# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
"""Write the figure data (data/*.json) for the fictional pitch deck of 株式会社レポミル.

Everything here is FICTIONAL: the company, the product, the customers and every number.
There is no source data; the values are written down once below and only checked for
internal consistency (nested market sizes, shares that add up, a plan that grows), so the
deck keeps the repository's rule that figure numbers come from a script's output.

    uv run examples/pitch-fictional/scripts/make_data.py
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

# Slide 2: three numbers about writing monthly reports today (fictional survey of 40 staff).
hook = {
    "cards": [
        {"label": "月報 1 本を書く時間", "value": 3.5, "digits": 1, "unit": "時間",
         "note": "集計・転記・文章の合計"},
        {"label": "提出までの書き直し", "value": 2.4, "digits": 1, "unit": "回",
         "note": "上司の差し戻しによる"},
        {"label": "確認を待つ日数", "value": 4, "unit": "日", "tone": "emph",
         "note": "提出から承認まで"},
    ]
}

# Slide 4: what the 40 interviewees complained about most (one answer each).
complaints = [("書く時間が足りない", 15), ("数字の転記の誤り", 11), ("書式がそろわない", 8),
              ("何を書けばよいか迷う", 6)]
hearing = {"groups": [{"label": k, "value": v} for k, v in complaints]}
hearing["groups"][0]["tone"] = "emph"

# Slide 7: market size in 億円 per year (TAM ⊃ SAM ⊃ SOM).
market = {"rings": [
    {"key": "TAM", "value": 2400, "basis": "国内の会社が社内文書を書く時間の人件費"},
    {"key": "SAM", "value": 480, "basis": "そのうち定型の報告書（月報・週報・日報）"},
    {"key": "SOM", "value": 24, "basis": "5 年で届く中堅企業 1,000 社"},
]}

# Slide 9: revenue plan in 億円 (fiscal years 1-5). SOM is the year-5 target.
plan = [0.2, 0.9, 2.6, 7.4, 24.0]
revenue = {
    "groups": [{"label": f"{i + 1} 年目", "value": v, "step": 1 if i < 3 else i - 1}
               for i, v in enumerate(plan)],
    "scale": [{"step": 3, "max": 27, "at": 0.4}],
}
revenue["groups"][-1]["tone"] = "emph"

# consistency checks (the deck's narration states these relations)
r = [x["value"] for x in market["rings"]]
assert r[0] > r[1] > r[2], "market rings must be nested"
assert sum(v for _, v in complaints) == 40, "one answer per interviewee"
assert all(a < b for a, b in zip(plan, plan[1:])), "the plan grows every year"
assert plan[-1] == r[2], "year-5 revenue equals the SOM"
assert max(plan[:4]) * 1.12 < 9, "years 1-4 fit the first axis (auto max)"

DATA.mkdir(exist_ok=True)
for name, obj in {"hook": hook, "hearing": hearing, "market": market, "revenue": revenue}.items():
    (DATA / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"data/{name}.json")
