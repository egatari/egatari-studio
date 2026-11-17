---
name: m-classify2d
display: 2 次元の分類 / 2-D classification
version: 2.0.1
series: academic
tier: specialized
set: ml
summary: scikit-learn の分類を 2 次元で描く。点・領域・境界・確率や決定関数の等高線・サポートベクトル・ボロノイ図・決定木の分割・k 平均法
steps: 点 → 領域 → 等高線 → サポートベクトル（決定木は分割 1 つずつ → 葉、k 平均法は割り当てと更新を交互に）
purposes: grouping, model
props: dur, size, marker
---

値は `uv run tools/sk2ega.py <モジュール> data.csv --fit "推定器(引数)"` の出力をそのまま書く。モジュールは `linear_model`・`svm`・`neighbors`・`tree`・`ensemble`・`cluster`。

<!-- llm: omit -->
機械学習の授業で、ロジスティック回帰の確率の等高線、SVM のマージンとサポートベクトル、k 近傍法の領域、決定木の分割、k 平均法の繰り返しを、scikit-learn が出した値のとおりに見せるときに使う。パーツはモデルの計算をしない。

- `axes`：`x`・`y` の `label` と `range`。`classes`（4 個まで）：`id`・`label`。`points`（300 個まで）：`[x, y, クラスの id]`
- `grid`：`nx`・`ny`（160 × 120 まで）と `labels`（格子の点の `predict`。2 次元の配列か「クラス*個数」の続け書き）。x は range を nx 点、y は ny 点に等分（numpy の linspace と meshgrid）。行 0 が y の最小。領域は薄い塗り、境界は違うクラスの間のセルの辺
- `fields`：格子の上の値（`predict_proba` の確率、`decision_function`）と `levels`。`class` はどのクラスの確率か（クラスの id。`decision_function` なら正の側のクラス）。sk2ega.py は 2 クラスのとき、名前で並べて 2 つ目のクラス（`predict_proba[:, 1]`）の確率を書き、`class` と `name`（例 `P(不良)`）でそれを示す。等高線は線の上に値を書く。`style` で `solid`・`dash`（SVM のマージン）
- `sv`：サポートベクトルの点の番号（`--fg` の輪）
- `voronoi`：`seeds`（`[x, y, クラス]`、40 個まで）。領域はパーツが種の点から計算する（1 近傍法）
- `tree`：`nodes`（`id`・`feature`（0 が x、1 が y）・`threshold`・`left`・`right`、葉は `class`）。分割を根から順に 1 つずつ、親のセルの中の線で描き、最後に葉を塗る。`--tree-out` で同じ id の m-tree の JSON も書く（横に並べてステップをそろえる）
- `kmeans`：`iters`（`centroids` と `assign`）。割り当て（点の色と重心のボロノイ図）→ 重心の更新（次の繰り返しの重心へ動く）を交互に。パーツは、割り当てが最も近い重心か、次の重心が割り当てた点の平均かを確かめる
- 色：クラスは `--series-1`・`--series-3`・`--fg`・`--series-4` の順の色（m-folds と同じ並び。印の色 `--emph` に近い `--series-2` は使わない）と点の形（○・□・△・◇）、境界と等高線は `--fg`、サポートベクトルの輪は `--fg`、重心は ×
- `--fit` は推定器の名前と値だけを読む（コードは実行しない）。`--model model.pkl` は自分で作ったモデルだけに使う（pickle を読むとコードが動く）
- 先のステップは薄く見せない
<!-- llm: end -->

サンプルは `demo.html`（ロジスティック回帰、線形 SVM、1 近傍法、決定木、k 平均法）。データはすべて架空、値は `tools/classify2d-demo.py` の出力。

<!-- llm: omit -->
注意

- 格子が細かいと JSON が大きくなる（fields は nx × ny の数）。見本は 48 × 32
- 点が多いと印が重なる。300 個まで、多ければ `marker` を小さく
<!-- llm: end -->
