# /// script
# requires-python = ">=3.10"
# dependencies = ["scikit-learn>=1.4", "numpy", "scipy"]
# ///
"""Data of 分類の境界と交差検証 (all fictional). Writes data/*.json for the slides, which copy them as they are.

    uv run scripts/make_data.py <egatari/components checkout>

- data/parts.csv: 40 fictional parts, two measurements x₁, x₂ and the class 良品 / 不良品 (make_blobs, fixed seed).
- logistic.json, svm.json: m-classify2d, from the parts library's tools/sk2ega.py (scikit-learn fits; the part only draws).
- loss.json: m-contour. The regularised mean logistic loss of p = σ(w₁x₁ + w₂x₂) (no intercept) over the same 40 points,
  L(w) = mean log-loss + |w|²/(2Cn) with C = 1 (scikit-learn's default L2 penalty, divided by Cn), on a grid of (w₁, w₂),
  and the path of gradient descent from (−1.5, −1.5) with learning rate 1.0 (8 points).
- folds.json: m-folds. StratifiedKFold(n_splits=4, shuffle=True, random_state=0) from tools/sk2ega.py model_selection, and
  for each split the error rate of LogisticRegression() trained on its train samples and scored on its test samples.
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from sklearn.datasets import make_blobs
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
SK2EGA = Path(sys.argv[1]).expanduser() / "tools" / "sk2ega.py"
CLASSES = ["良品", "不良品"]


def r(v):
    return float(f"{float(v):.4g}")


def sk2ega(*args):
    out = subprocess.check_output(["uv", "run", "--quiet", str(SK2EGA), *args], text=True)
    return json.loads(out)


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False) + "\n", encoding="utf-8")
    print(name)


X, y = make_blobs(n_samples=40, centers=[[-1.2, -0.8], [1.2, 0.8]], cluster_std=0.9, random_state=11)
X = np.round(X, 2)
csv_path = DATA / "parts.csv"
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["x₁", "x₂", "class"])
    for p, c in zip(X, y):
        w.writerow([f"{p[0]:.2f}", f"{p[1]:.2f}", CLASSES[c]])

save("logistic.json", sk2ega("linear_model", str(csv_path), "--fit", "LogisticRegression()", "--grid", "48x32",
                             "--levels", "0.25,0.5,0.75"))
save("svm.json", sk2ega("svm", str(csv_path), "--fit", "SVC(kernel='linear', C=1.0)", "--grid", "48x32"))

# Loss surface of the no-intercept logistic model over (w1, w2), and gradient descent on it
t = (y == 1).astype(float)


PEN = 1 / (2 * 1.0 * len(t))   # |w|^2 / (2 C n), C = 1


def loss(w):
    z = X @ w
    return float(np.mean(np.logaddexp(0, z) - t * z) + PEN * (w @ w))


def grad(w):
    p = 1 / (1 + np.exp(-(X @ w)))
    return X.T @ (p - t) / len(t) + 2 * PEN * w


W1, W2 = np.linspace(-2, 4, 49), np.linspace(-2, 4, 49)
grid = [[r(loss(np.array([a, b]))) for a in W1] for b in W2]
w, path = np.array([-1.5, -1.5]), []
for _ in range(8):
    path.append([r(w[0]), r(w[1])])
    w = w - 1.0 * grad(w)
save("loss.json", {"grid": {"nx": W1.size, "ny": W2.size, "values": grid}, "axes": {"x": "*w*_1", "y": "*w*_2"},
                   "label": "損失", "range": {"x": [-2, 4], "y": [-2, 4]}, "levels": [0.22, 0.3, 0.5, 1, 2, 3],
                   "path": path, "monotone": True})

folds = sk2ega("model_selection", str(csv_path), "--fit", "StratifiedKFold(n_splits=4, shuffle=True, random_state=0)",
               "--label", "class")
errors = []
for s in folds["splits"]:
    tr, te = np.array(s["train"]), np.array(s["test"])
    m = LogisticRegression().fit(X[tr], y[tr])
    errors.append(round(float(1 - m.score(X[te], y[te])), 2))
folds["errors"] = errors
save("folds.json", folds)
print("fold errors", errors, "mean", round(sum(errors) / len(errors), 4), file=sys.stderr)
from scipy.optimize import minimize
opt = minimize(loss, np.zeros(2), jac=grad)
print("minimum", np.round(opt.x, 3), round(opt.fun, 4), file=sys.stderr)
print("gd path loss", [round(loss(np.array(p)), 3) for p in path], file=sys.stderr)
