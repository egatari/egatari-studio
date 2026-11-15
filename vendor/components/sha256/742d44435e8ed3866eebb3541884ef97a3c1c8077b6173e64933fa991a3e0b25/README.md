---
name: m-network
display: グラフの探索 / Graph search
version: 2.0.0
series: info
tier: specialized
set: algo
summary: グラフの探索（幅優先・ダイクストラなど）や巡回路を 1 ステップずつ。今の頂点・候補・訪れた頂点、選んだ辺、合計
steps: steps の数
purposes: process, model
props: dur, size, weights
---

状態と合計は、探索を走らせたスクリプトの出力を書く。高さは本文がこの図だけなら 440px、上に文があれば 380px。書かない欄は前のステップのまま。優先度付きの `frontier` は `[["C", 3]]`、`take`・`drop` は選んだ辺を増減する。`total` は `parent` があれば `current` までの道のり、なければ選んだ辺の `w` の和（`w` は `total` と同じ桁で書く）。数など和でない `total` には `total.check: false`。

<!-- llm: omit -->
幅優先探索・深さ優先探索・ダイクストラ法・巡回セールスマン問題の近似（最近傍法、2-opt）など、グラフの上で手順を 1 つずつ進める様子を見せるときに使う。

子の JSON：`{"nodes": [...], "edges": [...], "steps": [...]}`。

- node：`id`、`x`、`y`（作者の単位。y は下向き）、`label`
- edge：`from`、`to`、`w`（重み）。`directed: true` で矢印
- step：`current`、`visited`、`frontier`（`["B", "C"]`。優先度付きは `[["C", 3], ["B", 4]]`）、`parent`（`{"C": "A"}`）、`take`・`drop`（`[["A", "C"]]`）、`total`、`note`
- `frontierKind`：`queue`・`stack`・`pq`・`set`。`total`：`{"label": "経路の長さ", "unit": "km"}`
- 書かなかった欄は前のステップのまま（`current` は `null` で消す）。`parent` は足していき、`null` で消す。`take`・`drop` は選んだ辺を増減する
- `complete: true`：辺を描かない完全グラフ（巡回路）。どの 2 点でも `take` できる
- 自己ループ（`from` と `to` が同じ辺）は頂点の外の小さな輪で、ほかの辺から離れた向きに描く。向きのあるグラフで A→B と B→A の両方があれば、それぞれ進む向きの右側へふくらむ弧にする（重みはふくらんだ側）
- `stochastic: true`（向きのあるグラフ）：各頂点から出る辺の `w` の和が 1 か確かめる（推移確率。合わなければ data）
- 確かめること（data）：知らない id、ない辺の `take`、選んでいない辺の `drop`。`total` が合うか：`parent` があれば出発点から `current` までの `parent` をたどった `w` の和、なければ選んだ辺の `w` の和（`total.of: "path"` か `"taken"` で決められる。`total.check: false` で確かめない）。`total` を `w` より細かい桁で書いたときは、辺の数 × ½·10^−(w の桁) まで違ってよい
- 色：今の頂点 `--emph` の太い輪、候補 `--accent2` の点線の輪（下の帯にも並べる）、訪れた頂点 `--muted` の塗り、選んだ辺と探索の木（`parent`、矢印）`--term`、ほかの辺 `--line`。色だけに頼らず、輪の形と帯で区別できる
- 時間：`drop` が消え（`dur` の半分）、`take` を書いた順に 1 本ずつ端から端へ引く。頂点の色は `dur` の半分で変わる。合計はステップの間に数え上げる
- 上限：頂点 24、辺 60、ステップ 40。頂点が重なる・重みの置き場がない・説明が長いときは layout、枠が小さいときは size で知らせる
- 先のステップは薄く見せない（答えになるので）
<!-- llm: end -->

サンプルは `demo.html`（幅優先探索、ダイクストラ法、巡回路の 2-opt、天気のマルコフ連鎖）。地名と数値はすべて架空。

<!-- llm: omit -->
注意

- 頂点の名前は短く（1〜3 字）。長い名前は箱が広がり、辺の重みの置き場がなくなる
- `take` は経路や巡回路の辺、`parent` は探索の木。両方を同じステップで使うと線が増えて読みにくい
<!-- llm: end -->
