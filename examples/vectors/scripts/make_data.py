# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""m-vector data of 内積・正射影と 1 次変換. Writes data/<name>.json; the slides copy them as they are.

    uv run scripts/make_data.py

m-vector computes each operation itself; the "value" written here is computed with numpy, and the part compares the two
(a mismatch is reported), so every number on the slides is checked twice. It also prints the values the narration says.
"""
import json
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parent.parent / "data"


def lst(v):
    return [float(x) if not float(x).is_integer() else int(x) for x in np.round(v, 6)]


def save(name, obj):
    (DATA / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False) + "\n", encoding="utf-8")


# 1. sum and difference
a, b = np.array([3, 1]), np.array([1, 2])
save("sum_diff", {"range": [-1, 5, -1, 4], "vectors": [{"id": "a", "v": lst(a)}, {"id": "b", "v": lst(b)}],
                  "ops": [{"sum": ["a", "b"], "as": "c", "value": lst(a + b)},
                          {"diff": ["a", "b"], "as": "d", "value": lst(a - b)}]})
print("a+b", a + b, "a-b", a - b)

# 2. projection and dot product
a, b = np.array([1, 3]), np.array([4, 2])
proj = (a @ b) / (b @ b) * b
save("proj_dot", {"range": [-1, 5, -1, 4], "vectors": [{"id": "a", "v": lst(a)}, {"id": "b", "v": lst(b)}],
                  "ops": [{"proj": ["a", "b"], "value": lst(proj)}, {"dot": ["a", "b"], "value": int(a @ b)}]})
print("proj", proj, "a.b", a @ b, "|proj|", np.linalg.norm(proj), "|b|", np.linalg.norm(b))

# 3. a matrix as a map of the plane
M = np.array([[3, 1], [0, 2]])
v = np.array([1, 1])
w, V = np.linalg.eig(M)
save("matrix", {"range": [-2, 5, -1, 4], "vectors": [{"id": "v", "v": lst(v)}], "matrix": M.tolist(),
                "show": ["grid", "unit", "eigen"]})
print("Mv", M @ v, "det", round(np.linalg.det(M), 6), "eigen", w, V.T)

# 4. change of basis
a = np.array([3, 1])
B = np.array([[1, 1], [1, -1]]).T          # columns b1 = (1, 1), b2 = (1, -1)
coords = np.linalg.solve(B, a)
save("basis", {"range": [-1, 4, -2, 3], "vectors": [{"id": "a", "v": lst(a)}], "basis": [[1, 1], [1, -1]]})
print("a in (b1, b2)", coords)
