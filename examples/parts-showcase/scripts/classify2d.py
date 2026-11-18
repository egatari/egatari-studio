# /// script
# requires-python = ">=3.10"
# dependencies = ["scikit-learn>=1.4", "numpy"]
# ///
"""Slide: m-classify2d. A depth-2 decision tree on fictional apples (weight g, sugar content °Brix): 出荷 or 加工.
    uv run scripts/classify2d.py <egatari/components checkout>"""
import csv, json, pathlib, subprocess, sys, tempfile
import numpy as np
rng = np.random.default_rng(21)
w = np.round(rng.uniform(220, 380, 36), 0)
s = np.round(rng.uniform(10, 16, 36), 1)
cls = np.where((w >= 280) & (s >= 12.5), "出荷", "加工")
here = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "apples.csv"
    with open(p, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f); wr.writerow(["重さ（g）", "糖度（度）", "class"]); wr.writerows(zip(w, s, cls))
    out = subprocess.check_output(["uv", "run", "--quiet", str(pathlib.Path(sys.argv[1]).expanduser() / "tools" / "sk2ega.py"), "tree", str(p),
                                   "--fit", "DecisionTreeClassifier(max_depth=2, random_state=0)"], text=True)
data = json.loads(out)
(here.parent / "data" / "classify2d.json").write_text(json.dumps(data, ensure_ascii=False) + "\n")
print({k: v for k, v in zip(*np.unique(cls, return_counts=True))}, [(n.get("feature"), n.get("threshold"), n.get("class")) for n in data["tree"]["nodes"]])
