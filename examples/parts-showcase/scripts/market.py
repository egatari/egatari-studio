"""Fictional TAM/SAM/SOM for a new service, computed from simple assumptions (m-market, slide 09).
Service: an online booking service for small hair salons (fictional)."""
import json
from pathlib import Path

salons = 250_000            # salons nationwide (assumed)
fee_per_year = 12           # 万円 per salon per year
tam = salons * fee_per_year / 10_000           # 億円
small_share = 0.6           # salons with 1-3 staff, our target
sam = tam * small_share
first_share = 0.05          # share we aim to win in 3 years
som = sam * first_share
out = {"unit": "億円", "rings": [
    {"key": "TAM", "value": round(tam), "basis": f"全国の美容室 {salons // 10000} 万店 × 年 {fee_per_year} 万円"},
    {"key": "SAM", "value": round(sam), "basis": f"スタッフ 3 人以下の店（{round(small_share*100)}%）"},
    {"key": "SOM", "value": round(som, 1), "basis": f"3 年で取る {round(first_share*100)}%"},
]}
Path(__file__).resolve().parent.parent.joinpath("data", "market.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
