"""Slide: m-trace. Traces progs/bubble.py with the parts library's tracer and writes data/trace.json.

    python3 scripts/trace.py <egatari/components checkout>     (runs: uv run <components>/tools/trace.py)
"""
import json, pathlib, subprocess, sys
here = pathlib.Path(__file__).resolve().parent
out = here.parent / "data" / "trace.json"
subprocess.run(["uv", "run", str(pathlib.Path(sys.argv[1]).expanduser() / "tools" / "trace.py"), str(here / "progs" / "bubble.py"),
                "--show", "scores,i,j", "--out", str(out)], check=True)
d = json.loads(out.read_text(encoding="utf-8"))
print(len(d["steps"]), "steps; swaps:", sum(1 for a, b in zip(d["steps"], d["steps"][1:]) if a["vars"].get("scores") != b["vars"].get("scores")),
      "; output:", d["steps"][-1].get("out", "").strip())
