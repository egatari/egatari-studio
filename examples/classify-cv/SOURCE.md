# 分類の境界と交差検証（classify-cv）

- **Place in the gallery (proposal):** 教育 / 大学の講義・学会発表 (機械学習入門; 科研費 中区分 61 人間情報学).
- **Parts:** m-classify2d, m-contour, m-folds (parts library 2.13; checked with 2.14.0). The parts draw what scikit-learn and the script computed; they compute no model.
- **Data:** `uv run scripts/make_data.py <egatari/components checkout>` writes `data/parts.csv` (40 fictional parts, make_blobs with a fixed seed) and, through the parts library's `tools/sk2ega.py`, `logistic.json` and `svm.json` (m-classify2d) and `folds.json` (m-folds, StratifiedKFold with 4 splits, plus the error rate of LogisticRegression on each split). `loss.json` (m-contour) is the regularised mean logistic loss without intercept, L(w) = mean log-loss + |w|²/(2Cn) with C = 1, on a grid of (w₁, w₂), with 8 points of gradient descent from (−1.5, −1.5), learning rate 1.0. The script also prints the minimum found by scipy (1.87, 0.94; L = 0.200) as a check. The slides copy the JSON files as they are.
- **Note on the probability field:** sk2ega writes `predict_proba[:, 1]`, the probability of the second class in sorted order, which is 良品 here, so the slide says 良品の確率.
- **Check:** data made with the released parts library v2.14.0 (5ff5925; `tools/sk2ega.py` names the class of the probability field, `P(良品)` with `class: 1`). Checked with Egatari Studio v0.6.15-rc.1 (bundles the parts library up to 2.15.0): 0 errors, 0 warnings.
- **Rights:** CC BY 4.0, © 2026 雲居玄道. The parts and measurements are fictional; there is no learner data.
