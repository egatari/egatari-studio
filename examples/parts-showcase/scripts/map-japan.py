"""Fictional per-prefecture values for the m-map-japan sample (slide 27).

Topic: members of a fictional subscription service per 10,000 people, FICTIONAL.
(Changed 11/7 from natto spending: a real topic with fictional numbers could be
mistaken for real data.)
Pattern: rises from west to east, by the longitude of each prefectural
capital, plus small seeded noise. Writes data/map-japan.json.
"""
import json
import random
from pathlib import Path

# JIS code -> longitude of the prefectural capital (degrees E, rounded)
LON = {
    "01": 141.35, "02": 140.74, "03": 141.15, "04": 140.87, "05": 140.10,
    "06": 140.36, "07": 140.47, "08": 140.45, "09": 139.88, "10": 139.06,
    "11": 139.65, "12": 140.12, "13": 139.69, "14": 139.64, "15": 139.02,
    "16": 137.21, "17": 136.63, "18": 136.22, "19": 138.57, "20": 138.18,
    "21": 136.72, "22": 138.38, "23": 136.91, "24": 136.51, "25": 135.87,
    "26": 135.76, "27": 135.52, "28": 135.18, "29": 135.83, "30": 135.17,
    "31": 134.24, "32": 133.05, "33": 133.93, "34": 132.46, "35": 131.47,
    "36": 134.56, "37": 134.04, "38": 132.77, "39": 133.53, "40": 130.42,
    "41": 130.30, "42": 129.87, "43": 130.74, "44": 131.61, "45": 131.42,
    "46": 130.56, "47": 127.68,
}
NAME = {"01": "北海道", "02": "青森", "03": "岩手", "04": "宮城", "05": "秋田",
        "06": "山形", "07": "福島", "08": "茨城", "09": "栃木", "10": "群馬",
        "11": "埼玉", "12": "千葉", "13": "東京", "14": "神奈川", "15": "新潟",
        "16": "富山", "17": "石川", "18": "福井", "19": "山梨", "20": "長野",
        "21": "岐阜", "22": "静岡", "23": "愛知", "24": "三重", "25": "滋賀",
        "26": "京都", "27": "大阪", "28": "兵庫", "29": "奈良", "30": "和歌山",
        "31": "鳥取", "32": "島根", "33": "岡山", "34": "広島", "35": "山口",
        "36": "徳島", "37": "香川", "38": "愛媛", "39": "高知", "40": "福岡",
        "41": "佐賀", "42": "長崎", "43": "熊本", "44": "大分", "45": "宮崎",
        "46": "鹿児島", "47": "沖縄"}

rng = random.Random(27)
values = {}
for code, lon in LON.items():
    v = 4000 + 280 * (lon - 135.0) + rng.uniform(-300, 300)
    values[code] = int(round(v / 100.0))  # members per 10,000 people

classes = [0, 30, 40, 50]
counts = [sum(1 for v in values.values() if lo <= v < hi)
          for lo, hi in zip(classes, classes[1:] + [10**9])]
hi_code = max(values, key=values.get)
lo_code = min(values, key=values.get)
out = {
    "note": "FICTIONAL. members of a fictional service per 10,000 people",
    "unit": "人", "classes": classes, "classCounts": counts,
    "values": values,
    "max": {"code": hi_code, "name": NAME[hi_code], "value": values[hi_code]},
    "min": {"code": lo_code, "name": NAME[lo_code], "value": values[lo_code]},
}
Path(__file__).resolve().parent.parent.joinpath("data", "map-japan.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
