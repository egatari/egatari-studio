# 内積・正射影と 1 次変換（vectors）

- **Place in the gallery (proposal):** 教育 / 大学の講義・学会発表 (線形代数; 科研費 中区分 12 解析学、応用数学およびその関連分野).
- **Parts:** m-vector (parts library 2.13; checked with 2.14.0). The part computes each operation itself.
- **Data:** `uv run scripts/make_data.py` writes `data/<name>.json` with the same operations computed by numpy as `value`; m-vector compares its own result with `value` and reports a mismatch. The script also prints the numbers the narration says (|proj| = √5, |b| = 2√5, det 6, eigenvalues 3 and 2, a = 2b₁ + b₂). The slides copy the JSON files as they are.
- **Check:** values from scripts/make_data.py (numpy). Checked with Egatari Studio v0.6.15-rc.1 (bundles the parts library up to 2.15.0): 0 errors, 0 warnings.
- **Rights:** CC BY 4.0, © 2026 雲居玄道. No outside material.
