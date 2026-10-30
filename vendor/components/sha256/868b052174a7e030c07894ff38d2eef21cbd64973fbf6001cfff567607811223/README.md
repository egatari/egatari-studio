---
name: m-sweep
series: academic
summary: パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す）
steps: values の数 − 1
props: f, values, param, xr, yr, xt, yt, xl, yl, digits, dur
---

「φ が大きいほど〜」を目で確かめさせるときに使う（motion-slides スキル §6「パラメータを動かす」）。
見本は `demo.html`。

`f` の式の中では、動かす値はいつも `c` と書く（`param` は図に表示する名前だけ。`param="η"` でも `f="u*u + c*u"`）。

`f` は算術の式（v1.0.2 から。コードとしては実行しない。[SECURITY.md](../../SECURITY.md)）：数、`u` と `c`、`Math.exp(…)` `Math.sin(…)` などの `Math` の関数と `Math.PI` などの定数、`+ - * / % **`、比較（`< <= > >= == !=`）、`&& || !`、`? :`、括弧。べき乗は `**`（`^` は書けない）。`-u ** 2` は `-(u ** 2)` か `(-u) ** 2` と書く。書けない式は図の代わりに札が出る。
