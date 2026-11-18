"""Slide: m-folds. TimeSeriesSplit(n_splits=4) on 16 fictional months, through the parts library's tools/sk2ega.py.
    python3 scripts/folds.py <egatari/components checkout>"""
import json, pathlib, subprocess, sys, tempfile
here = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "months.csv"
    p.write_text("month\n" + "".join(f"{m}\n" for m in range(1, 17)), encoding="utf-8")
    out = subprocess.check_output(["uv", "run", "--quiet", str(pathlib.Path(sys.argv[1]).expanduser() / "tools" / "sk2ega.py"), "model_selection", str(p),
                                   "--fit", "TimeSeriesSplit(n_splits=4)", "--t", "month"], text=True)
data = json.loads(out)
(here.parent / "data" / "folds.json").write_text(json.dumps(data, ensure_ascii=False) + "\n")
print([(len(s["train"]), len(s["test"]), min(s["test"]) + 1, max(s["test"]) + 1) for s in data["splits"]])
