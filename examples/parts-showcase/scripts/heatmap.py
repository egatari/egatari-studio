"""Fictional counter congestion: people per hour by weekday x time slot (m-heatmap, slide 04)."""
import json
from pathlib import Path

days = ["月", "火", "水", "木", "金"]
slots = ["9時", "11時", "13時", "15時"]
day_factor = [1.4, 1.0, 0.9, 1.0, 1.2]     # Mondays and Fridays are busier
slot_base = [18, 30, 22, 16]               # late-morning peak, lunch dip
# rows = time slots, cols = weekdays (fewer rows -> taller cells)
values = [[round(b * f) for f in day_factor] for b in slot_base]
peak = max(((r, c) for r in range(len(slots)) for c in range(len(days))), key=lambda rc: values[rc[0]][rc[1]])
out = {"rows": slots, "cols": days, "values": values, "unit": "人", "peak": list(peak),
       "peak_label": f"{days[peak[1]]}曜 {slots[peak[0]]}", "peak_value": values[peak[0]][peak[1]],
       "min_value": min(min(r) for r in values)}
Path(__file__).resolve().parent.parent.joinpath("data", "heatmap.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
