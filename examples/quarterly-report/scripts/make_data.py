"""Fictional numbers for the quarterly report of a fictional company (A 食品).
Run: python3 scripts/make_data.py  -> data/report.json. Every number on the slides comes from here.
"""
import json
from pathlib import Path

Q = ["24 Q4", "25 Q1", "25 Q2", "25 Q3", "25 Q4", "26 Q1", "26 Q2", "26 Q3"]
SALES = [41.2, 42.0, 43.5, 44.1, 44.8, 45.9, 47.3, 49.0]          # 億円
DEPT_PREV = {"冷凍食品": 18.1, "菓子": 12.4, "飲料": 9.6, "業務用": 7.2}   # 前期（26 Q2）
DEPT_NOW = {"冷凍食品": 19.3, "菓子": 13.0, "飲料": 9.3, "業務用": 7.4}    # 今期（26 Q3）
assert abs(sum(DEPT_PREV.values()) - SALES[-2]) < 1e-9 and abs(sum(DEPT_NOW.values()) - SALES[-1]) < 1e-9
COST = {"原材料": 25.5, "人件費": 10.3, "物流": 5.9, "その他": 4.2}       # 今期の費用（億円）
profit = round(SALES[-1] - sum(COST.values()), 2)
NEW_CLIENTS, NEW_CLIENTS_PREV = 1240, 1105
S, M, F = SALES[-1], COST["原材料"], round(sum(COST.values()) - COST["原材料"], 2)

def profit_at(u, c):  # u: 原材料の値上がり率（%）, c: 価格改定（%）, 数量は変わらないと置く
    return S * (1 + c / 100) - M * (1 + u / 100) - F

out = {
  "quarters": Q, "sales": SALES,
  "kpi": {"sales": SALES[-1], "sales_qoq": round((SALES[-1] / SALES[-2] - 1) * 100, 1),
          "profit": profit, "margin": round(profit / SALES[-1] * 100, 1),
          "new_clients": NEW_CLIENTS, "new_clients_diff": NEW_CLIENTS - NEW_CLIENTS_PREV},
  "dept_delta": {k: round(DEPT_NOW[k] - DEPT_PREV[k], 1) for k in DEPT_NOW},
  "breakdown": {**COST, "営業利益": profit},
  "sweep": {"S": S, "M": M, "F": F, "u_point": 5,
            "profit_u5_c0": round(profit_at(5, 0), 2), "profit_u5_c3": round(profit_at(5, 3), 2)},
}
assert abs(profit_at(0, 0) - profit) < 1e-9
Path(__file__).resolve().parent.parent.joinpath("data", "report.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(json.dumps(out["kpi"], ensure_ascii=False), out["dept_delta"], out["sweep"])
