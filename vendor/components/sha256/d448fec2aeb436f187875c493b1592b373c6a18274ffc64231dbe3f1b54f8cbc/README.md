---
name: m-contour
display: 等高線 / Contour plot
version: 2.0.0
series: academic
tier: specialized
set: ml
summary: 2 変数の関数の等高線を値ごとに引き、勾配の矢印と、勾配降下法などの反復の道を 1 点ずつ見せる
steps: 等高線の値ごと（by="all" なら 1）→ 勾配 → 道の点ごと
purposes: model, change
props: dur, size, by
---

関数は式 `f`（`x` と `y` の算術の式）か、スクリプトが計算した格子の値 `grid` のどちらか。`levels`（8 個まで）、`gradient.at`（勾配の矢印を描く点）、`path`（反復の点。スクリプトの出力）。大きさの目安：`equal`（既定）で range が正方形なら、図は（高さ − 約 95px）の正方形で左に寄り、右に 240px 以上空けば関数の名前と反復ごとの f の欄になる。高さ 440px なら幅 740px ほど（右に別の字や図を並べる）。横いっぱいに使うなら range の x を広げるか `equal: false`。

<!-- llm: omit -->
多変数の微分や機械学習の授業で、等高線と勾配の向き（等高線に垂直）、鞍点、損失の等高線の上で勾配降下法が進む様子を見せるときに使う。

- `range`：`{"x": [min, max], "y": [min, max]}`。`equal`（既定 true）で縦と横の 1 の長さをそろえる
- `f`：`x**2 + 3*y**2` のような算術の式（`**` がべき、`exp(…)`・`sin(…)` などは Math の関数）。コードとしては動かさない
- `grid`：`nx`・`ny`・`values`（行ごと、行 0 が y の最小。x は range を nx 点、y は ny 点に等分）。式で書けない関数（損失など）に
- `levels`：等高線の値。線の上に値を書く（地の色の縁取り、ほかの値と重ならない所）
- `gradient`：`at`（6 点まで）に勾配の矢印。`scale`（なければ、いちばん長い矢印が範囲の幅の 18 %）、`tangent: true` で接線の破線
- `path`：反復の点（30 点まで）。1 点ずつ線を伸ばし、上の行に「反復 3：f = 1.23」。`monotone: true` なら f が増えたところを data で知らせる
- `label`：上の行の右に関数の名前（`*f* = *x*² + 3*y*²`）。`axes`：軸の名前
- 色：等高線 `--term`、勾配 `--accent2`、道 `--fg`、今の点 `--emph`
- 先のステップは薄く見せない
<!-- llm: end -->

サンプルは `demo.html`（勾配と勾配降下法、鞍点、損失の格子）。値は `tools/contour-demo.py` の出力。

<!-- llm: omit -->
注意

- 式で書いた f は 97 × 73 の格子で等高線を引く。細い谷は格子の値 `grid` で細かく渡す
- 等高線が範囲を通らない値は layout で知らせる
<!-- llm: end -->
