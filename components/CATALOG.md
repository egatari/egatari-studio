# 部品の一覧

`node tools/catalog.mjs` が各部品の README.md の先頭から作る。手で直さない。

| 部品 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|
| [`<m-bars>`](bars/README.md) | 棒を段階ごとに 0 から伸ばす（縦棒・横棒・組の棒）。値の軸の上限を段階で広げて「軸を突き抜ける伸び」も見せられる | 組の step と scale の step の最大（既定は組 1 つ = 1 段階。per-step で n 組ずつ） | orient, max, unit, digits, per-step, dur, stagger, count, ticks, zoom, al | [demo](bars/demo.html) |
| [`<m-collect>`](collect/README.md) | 並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる | 1 | move, stagger, shrink, chip-w, chip-h, box-w, box-h | [demo](collect/demo.html) |
| [`<m-curves>`](curves/README.md) | 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く） | 系列の数 | xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw | [demo](curves/demo.html) |
| [`<m-flow>`](flow/README.md) | 流れ図の箱と矢印を段階ごとに出して、図を組み立てる | nodes と edges の step の最大 | fade, draw, size, pulse-dur, pulse-n | [demo](flow/demo.html) |
| [`<m-kpi>`](kpi/README.md) | 大きな数字の札（KPI）を段階ごとに出す。数字は数え上げ、下に増減の矢印と一言 | 札の step の最大（既定は札 1 枚 = 1 段階。per-step で n 枚ずつ） | cols, digits, per-step, dur, stagger, count, size | [demo](kpi/demo.html) |
| [`<m-market>`](market/README.md) | 市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる | rings の数 | unit, digits, scale, layout, dur, count | [demo](market/demo.html) |
| [`<m-quad>`](quad/README.md) | 2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）に、点を段階ごとに 1 つずつ置く | 点の step と to.step の最大（既定は点 1 つ = 1 段階） | fade, move, size, quads-step | [demo](quad/demo.html) |
| [`<m-seq>`](seq/README.md) | 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す） | ceil((steps の数 − 1) / per-step) | per-step, slot, xr, yr, xt, yt, xf, yf, xl, yl, digits, panel, ghosts | [demo](seq/demo.html) |
| [`<m-sweep>`](sweep/README.md) | パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す） | values の数 − 1 | f, values, param, xr, yr, xt, yt, xl, yl, digits, dur | — |
