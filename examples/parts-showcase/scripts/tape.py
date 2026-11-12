"""Slide 06: brother has twice the younger brother's savings; total is given."""
import json, pathlib

total = 1800           # yen, fictional
times = 2              # brother = 2 x younger
parts = 1 + times      # total = 3 portions
assert total % parts == 0
young = total // parts
elder = young * times
assert young + elder == total and elder == 2 * young
data = {
    "rows": [
        {"label": "弟", "show": 1, "segs": [{"v": young, "unknown": "□", "label": " 円"}]},
        {"label": "兄", "show": 2, "segs": [{"v": young}, {"v": young}]},
        {"label": "合計", "show": 4, "segs": [{"v": young}, {"v": young}, {"v": young}]},
    ],
    "times": [{"from": 0, "to": 1, "label": "2 倍", "show": 3}],
    "brace": [{"row": 2, "from": 0, "to": 2, "label": f"{total} 円", "side": "below", "show": 5}],
    "_check": {"total": total, "parts": parts, "young": young, "elder": elder},
}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "tape.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"]))
