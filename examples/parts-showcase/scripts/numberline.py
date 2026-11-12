"""Slide 05: compare 3/4 and 0.7 on a number line (exact rational arithmetic)."""
import json, pathlib
from fractions import Fraction as F

a = F(3, 4)            # 3/4
b = F(7, 10)           # 0.7
assert a == F(75, 100) and a > b
diff = a - b
assert diff == F(5, 100)
data = {
    "lines": [{"from": 0, "to": 1, "step": 0.1}],
    "marks": [
        {"at": 0.7, "label": "0.7", "kind": "dot"},
        {"at": "3/4", "label": "3/4", "kind": "dot", "tone": "emph"},
        {"at": float(a), "line": 1, "tone": "emph", "show": 5},
    ],
    "magnify": [{"from": 0.7, "to": 0.8, "step": 0.01}],
    "_check": {"three_quarters_decimal": float(a), "difference": float(diff), "larger": "3/4"},
}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "numberline.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"]))
