---
name: m-collect
version: 2.0.2
series: academic
tier: extra
summary: 並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる
steps: 1
purposes: grouping
props: move, stagger, shrink, chip-w, chip-h, box-w, box-h
---

「8 回の観測が 2 つの事後モーメントに要約される」のように、多くのものが少数の統計量に
まとまることを見せるときに使う（motion-slides スキル §6「まとまる」）。

子の JSON：`{"chips": [{"label", "to", "tone"}], "targets": [{"label", "tex", "value", "tone", "x", "y"}], "cols": 4}`。

- `to` は行き先の番号、または番号の配列（配列なら札の写しがそれぞれの箱へ動く）
- 札は上の段に `cols` 列で並ぶ（既定は札の数で 1 行）。箱は下の段に等間隔（`x`, `y` を書けばその中心）
- `tone`：`term`・`emph`・`muted`。札の既定は `term`、箱の既定は `emph`
- 箱に `tex` と `label` の両方があれば、式を箱の中に、`label` を箱の下に小さく書く（下に入らなければ上）
- 段階 1 の始めに箱の点線の枠を出し、札が着いてから箱の中身を出す。`data-from` で始まる段階をずらせる

見本は `demo.html`（コイン投げの結果から Beta 事後分布の平均と分散）。
