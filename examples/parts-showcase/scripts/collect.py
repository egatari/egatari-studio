"""Fictional free-text answers to a city park survey, for slide 35 (m-collect).

Each answer is tagged with one of three groups; the box values are the counts per group.
Writes ../data/collect.json (the m-collect child JSON).
"""
import json
from pathlib import Path

groups = ["遊具", "設備", "安全"]
answers = [  # (fictional answer, group index), in the order they came in
    ("すべり台がほしい", 0),
    ("トイレが汚い", 1),
    ("夜は暗くて怖い", 2),
    ("ベンチが少ない", 1),
    ("砂場を広げてほしい", 0),
    ("自転車が速くて危ない", 2),
    ("水飲み場がない", 1),
    ("遊具が古い", 0),
    ("見通しが悪い", 2),
]
counts = [sum(1 for _, g in answers if g == j) for j in range(len(groups))]
assert sum(counts) == len(answers)

data = {
    "cols": 3,
    "chips": [{"label": a, "to": g} for a, g in answers],
    "targets": [{"label": name, "value": f"{n} 件"} for name, n in zip(groups, counts)],
}
out = Path(__file__).resolve().parent.parent / "data" / "collect.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(out)
