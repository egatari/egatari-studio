---
name: m-sweep
version: 2.1.2
series: academic
tier: specialized
set: math
summary: パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す）
steps: values の数 − 1（at があれば 1）
purposes: parameter
props: f, values, param, xr, yr, xt, yt, xl, yl, digits, dur, at, point, size
---

「φ が大きいほど〜」を目で確かめさせるときに使う（motion-slides スキル §6「パラメータを動かす」）。
見本は `demo.html`。

`f` の式の中では、動かす値はいつも `c` と書く（`param` は図に表示する名前だけ。`param="η"` でも `f="u*u + c*u"`）。

`f` は算術の式（v1.0.2 から。コードとしては実行しない。[SECURITY.md](../../SECURITY.md)）：数、`u` と `c`、`Math.exp(…)` `Math.sin(…)` などの `Math` の関数と `Math.PI` などの定数、`+ - * / % **`、比較（`< <= > >= == !=`）、`&& || !`、`? :`、括弧。べき乗は `**`（`^` は書けない）。`-u ** 2` は `-(u ** 2)` か `(-u) ** 2` と書く。書けない式は図の代わりに札が出る。
- `at="[0.5, 3]"`：変化ごとの開始秒。あれば変化をすべてステップ 1 に入れる（音楽や口述に合わせる）
- `point='{"u": 9.8, "label": "平均待ち {y} 日"}'`：u の所の曲線上の点。値が変わると曲線について動く。yr の外では隠して知らせる
- `size="40"`：字の大きさ（24 以上）

<!-- llm: omit -->
先のステップを薄く見せる表示（`ctx.preview`）：先の値の曲線を `--emph` で薄く見せる（今ある跡の線を使う）。先の値の「c = …」の字は出さない（新しい要素が要るため）
<!-- llm: end -->
