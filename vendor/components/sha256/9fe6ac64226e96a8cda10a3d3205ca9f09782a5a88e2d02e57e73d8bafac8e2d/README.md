---
name: m-curves
series: academic
summary: 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く）
steps: 系列の数
props: xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw
---

同じ予測分布に平均・中央値・分位点を順に引く、損失関数を 1 つずつ重ねる、など
「一つの図で比較の軸を一つずつ見せる」ときに使う（motion-slides スキル §6「線を 1 本ずつ引く」）。

系列は子の `<script type="application/json">` に配列で書く。

| 欄 | 意味 |
|---|---|
| `label` | 線の名前（`*斜体*` `_下付き` `^上付き`） |
| `f` | x の式（JavaScript。`Math` の関数と `N(x, 平均, 標準偏差)` が使える）。`xr` で描く範囲を狭められる |
| `pts` | 点列 `[[x, y], …]`（縦線や実測の折れ線） |
| `color` | `series-2` `emph` などテーマの変数の名前（既定は `--series-1..4` の順） |
| `dash` | 破線 |
| `at` / `anchor` / `dx` / `dy` / `ly` | 名前の位置：横軸の値 `at` の点に置く（既定は線の端）。`ly` は縦軸の値で高さを決める |

見本は `demo.html`（予測分布と代表値、損失関数の形）。
