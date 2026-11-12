"""Fictional comparison of paper vs online applications at a city office (m-compare, slide 03)."""
import json
from pathlib import Path

paper_hours = (17 - 9) * 5          # weekday 9-17 -> hours per week
online_hours = 24 * 7
paper_wait, online_wait = 35, 0     # minutes waited at the counter (fictional)
out = {
    "sides": ["紙の申請", "オンライン申請"],
    "rows": [
        {"label": "受付時間", "values": ["平日 9〜17 時", "24 時間"],
         "hours_per_week": [paper_hours, online_hours],
         "diff": f"受付が {online_hours / paper_hours:.1f} 倍", "better": 1},
        {"label": "待ち時間", "values": [f"平均 {paper_wait} 分", "なし"],
         "diff": f"{paper_wait} 分の短縮", "better": 1},
        {"label": "必要なもの", "values": ["申請書・印鑑\n本人確認書類", "マイナンバー\nカード"],
         "diff": "カード 1 枚で済む", "better": 1},
    ],
}
Path(__file__).resolve().parent.parent.joinpath("data", "compare.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
