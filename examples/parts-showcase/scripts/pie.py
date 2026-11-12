"""Fictional city budget breakdown in 億円 (m-pie, slide 08)."""
import json
from pathlib import Path

slices = [("福祉", 182), ("教育", 96), ("道路・まちづくり", 74), ("ごみ・環境", 38), ("消防・防災", 30), ("その他", 60)]
total = sum(v for _, v in slices)
out = {"unit": "億円", "total": total,
       "slices": [{"label": k, "value": v, "pct": round(100 * v / total, 1)} for k, v in slices]}
Path(__file__).resolve().parent.parent.joinpath("data", "pie.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
