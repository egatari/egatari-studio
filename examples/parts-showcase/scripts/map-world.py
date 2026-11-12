"""Fictional overseas offices of a fictional stationery maker (slide 28).

City coordinates are real (rounded); opening years and staff counts are
FICTIONAL. Writes data/map-world.json.
"""
import json
from pathlib import Path

HQ = {"name": "東京", "lon": 139.69, "lat": 35.69}
OFFICES = [  # name, lon, lat, opened (fictional), staff (fictional)
    ("上海", 121.47, 31.23, 2006, 120),
    ("シンガポール", 103.82, 1.35, 2009, 80),
    ("ロサンゼルス", -118.24, 34.05, 2014, 60),
    ("ロンドン", -0.13, 51.51, 2017, 40),
    ("シドニー", 151.21, -33.87, 2022, 25),
]
offices = []
for name, lon, lat, year, staff in OFFICES:
    decade = (year // 10) * 10
    offices.append({"name": name, "lon": lon, "lat": lat, "opened": year,
                    "staff": staff, "decade": decade})
decades = sorted({o["decade"] for o in offices})
for o in offices:
    o["step"] = 2 + decades.index(o["decade"])  # step 1 = HQ
out = {"note": "FICTIONAL company; years and staff are fictional",
       "hq": HQ, "offices": offices, "decades": decades,
       "totalStaff": sum(o["staff"] for o in offices)}
Path(__file__).resolve().parent.parent.joinpath("data", "map-world.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
