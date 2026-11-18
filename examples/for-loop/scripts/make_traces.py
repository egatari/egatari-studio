"""Trace the three programs of this lesson with the parts library's tracer and write data/<name>.json.

    uv run scripts/make_traces.py <components checkout>

The tracer is tools/trace.py of egatari/components (released tag v2.12.0 or later).
The slides copy these files as they are, except the hand-written "note" of each step (tools/trace.py allows a note to
be added after tracing). Nothing here is learner data; the scores and votes are fictional.
"""
import json
import subprocess
import sys
from pathlib import Path

# One short note per step (all steps or none, as tools/trace.py asks). Written by hand after tracing.
NOTES = {
    "sum_avg": ["点数のリストを作る", "合計 total を 0 から始める", "s に最初の点 7 が入る", "total に 7 を足して 7",
                "s に次の点 9", "足して 16", "s に次の点 8", "足して 24", "点が残っていないので、繰り返しを終える",
                "合計 24 を表示する", "合計を人数 3 で割って、平均 8.0"],
    "reset_bug": ["点数のリストを作る", "s に最初の点 7 が入る", "total を 0 にする", "足して 7",
                  "s に次の点 9", "total がまた 0 に戻る", "足して 9 ── 7 が消えた", "s に次の点 8",
                  "また 0 に戻る", "足して 8", "繰り返しを終える", "表示は 8。合計の 24 にならない"],
    "count_votes": ["3 人の票のリストを作る", "数える辞書 counts を空で用意する", "v に「劇」", "劇はまだないので 0 + 1 = 1",
                    "v に「展示」", "展示も 0 + 1 = 1", "v に 2 票目の「劇」", "劇は 1 + 1 = 2",
                    "票が残っていないので終える", "出し物ごとの票の数を表示する"],
}

HERE = Path(__file__).resolve().parent
TRACE = Path(sys.argv[1]).expanduser() / "tools" / "trace.py"
for prog in sorted((HERE / "progs").glob("*.py")):
    out = HERE.parent / "data" / f"{prog.stem}.json"
    subprocess.run(["uv", "run", str(TRACE), str(prog), "--out", str(out)], check=True)
    data = json.loads(out.read_text(encoding="utf-8"))
    notes = NOTES[prog.stem]
    assert len(notes) == len(data["steps"]), (prog.stem, len(notes), len(data["steps"]))
    for step, note in zip(data["steps"], notes):
        step["note"] = note
    out.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(out.name)
