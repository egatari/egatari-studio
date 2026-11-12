"""Fictional quarterly figures for the Egatari intro (slide 2).

All numbers are invented ("架空"). Run: uv run python scripts/make_data.py
Writes data/kpi.json; the deck copies these values verbatim.
"""
import json
from pathlib import Path

# Fictional company: quarterly sales (億円) for FY Q1..Q4
sales = {"Q1": 1.82, "Q2": 1.95, "Q3": 2.10, "Q4": 2.38}
members_q3, members_q4 = 11800, 13450   # app members (人)
churn_q3, churn_q4 = 3.4, 2.6           # monthly churn (%)

q3, q4 = sales["Q3"], sales["Q4"]
out = {
    "note": "架空の数字（Egatari の紹介のため）",
    "sales_by_quarter": sales,
    "kpi": [
        {"label": "売上（Q4）", "value": q4, "digits": 2, "unit": "億円",
         "delta_pct": round((q4 - q3) / q3 * 100, 1)},
        {"label": "会員数", "value": members_q4, "unit": "人",
         "delta_pct": round((members_q4 - members_q3) / members_q3 * 100, 1)},
        {"label": "解約率（月）", "value": churn_q4, "digits": 1, "unit": "%",
         "delta_pt": round(churn_q4 - churn_q3, 1)},
    ],
}
Path(__file__).resolve().parent.parent.joinpath("data", "kpi.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out["kpi"], ensure_ascii=False))
