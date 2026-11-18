"""Slide: m-vector. Two ropes pull a box (fictional forces in newtons); their resultant, checked with numpy."""
import json, pathlib
import numpy as np
f1, f2 = np.array([4, 1]), np.array([1, 3])
r = f1 + f2
data = {"range": [-1, 6, -1, 5], "vectors": [{"id": "f1", "v": f1.tolist(), "label": "*F*_1"}, {"id": "f2", "v": f2.tolist(), "label": "*F*_2"}],
        "ops": [{"sum": ["f1", "f2"], "as": "r", "value": r.tolist()}]}
(pathlib.Path(__file__).resolve().parent.parent / "data" / "vector.json").write_text(json.dumps(data, ensure_ascii=False) + "\n")
print("resultant", r.tolist(), "size", round(float(np.linalg.norm(r)), 3))
