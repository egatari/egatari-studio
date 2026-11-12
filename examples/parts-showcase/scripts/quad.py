"""Fictional placement of training topics for slide 21 (m-quad).

x = 緊急度, y = 重要度, both on 0..1 (0.5 = the crossing of the axes).
The scores are a fictional judgement by a training office, on a 1..5 scale,
mapped to 0..1 by (s - 1) / 4 and pulled slightly toward the centre so labels stay inside.
Writes ../data/quad.json (the m-quad child JSON).
"""
import json
from pathlib import Path

topics = [
    # (label, urgency 1-5, importance 1-5, label anchor)
    ("個人情報の扱い", 4.5, 5, "left"),
    ("新システムの操作", 5, 3.5, "left"),
    ("電話の応対", 2, 4.5, "right"),
    ("文書の書き方", 1.5, 3.5, "right"),
    ("年末の事務", 4, 2, "left"),
    ("表計算の小技", 2, 1.5, "right"),
]

def pos(s):
    return round(0.1 + 0.8 * (s - 1) / 4, 2)

items = [{"label": l, "x": pos(u), "y": pos(i), "anchor": a, "tone": "term"} for l, u, i, a in topics]
data = {
    "x": {"lo": "急がない", "hi": "急ぐ"},
    "y": {"lo": "重要度が低い", "hi": "重要度が高い"},
    "quads": {"tr": "すぐ行う", "tl": "計画して行う", "br": "短く済ませる", "bl": "見送る", "fill": "tr"},
    "items": items,
}
out = Path(__file__).resolve().parent.parent / "data" / "quad.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(out)
