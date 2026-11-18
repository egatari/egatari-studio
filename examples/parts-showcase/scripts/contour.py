"""Slide: m-contour. f = (x − 1)² + 2(y + 0.5)², the gradient at two points, and gradient descent from (−2, 1.5)
with learning rate 0.2 (5 points)."""
import json, pathlib
import numpy as np
f = lambda p: (p[0] - 1) ** 2 + 2 * (p[1] + 0.5) ** 2
g = lambda p: np.array([2 * (p[0] - 1), 4 * (p[1] + 0.5)])
p, path = np.array([-2.0, 1.5]), []
for _ in range(5):
    path.append([round(float(p[0]), 4), round(float(p[1]), 4)])
    p = p - 0.2 * g(p)
data = {"f": "(x-1)**2 + 2*(y+0.5)**2", "label": "*f* = (*x* − 1)² + 2(*y* + 0.5)²", "range": {"x": [-3, 3], "y": [-2, 2]},
        "levels": [0.5, 2, 5, 10], "gradient": {"at": [[-2, 1.5], [2.5, -1.5]]}, "path": path, "monotone": True}
(pathlib.Path(__file__).resolve().parent.parent / "data" / "contour.json").write_text(json.dumps(data, ensure_ascii=False) + "\n")
print("f along the path", [round(f(np.array(q)), 3) for q in path], "minimum (1, -0.5)")
