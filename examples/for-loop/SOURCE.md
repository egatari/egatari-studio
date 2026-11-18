# for 文で合計と平均を求める（for-loop）

- **Place in the gallery (proposal):** 教育 / 授業 / 情報（高校 情報 I、プログラミング）.
- **Parts:** m-trace (parts library 2.12, tier local) and m-cards. m-trace draws a trace written by a tracer; it never runs code.
- **Data:** `scripts/progs/*.py` are the three programs shown on the slides. `uv run scripts/make_traces.py <egatari/components checkout>` runs the tracer `tools/trace.py` on each and writes `data/<name>.json`, adding one hand-written note per step. The slides copy these files as they are.
- **Check:** traced with the released parts library v2.12.0 (98b70a4, m-trace 2.0.0; data/ keeps the Python 3.13 run). Checked with Egatari Studio v0.6.15-rc.1 (bundles the parts library up to 2.15.0): 0 errors, 0 warnings.
- **Rights:** CC BY 4.0, © 2026 雲居玄道. The scores and votes are fictional; there is no learner data.
