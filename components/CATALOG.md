# 部品の一覧

`node tools/catalog.mjs` が各部品の README.md の先頭から作る。手で直さない。

| 部品 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|
| [`<m-collect>`](collect/README.md) | 並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる | 1 | move, stagger, shrink, chip-w, chip-h, box-w, box-h | [demo](collect/demo.html) |
| [`<m-curves>`](curves/README.md) | 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く） | 系列の数 | xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw | [demo](curves/demo.html) |
| [`<m-flow>`](flow/README.md) | 流れ図の箱と矢印を段階ごとに出して、図を組み立てる | nodes と edges の step の最大 | fade, draw, size | [demo](flow/demo.html) |
| [`<m-seq>`](seq/README.md) | 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す） | ceil((steps の数 − 1) / per-step) | per-step, slot, xr, yr, xt, yt, xf, yf, xl, yl, digits, panel, ghosts | [demo](seq/demo.html) |
| [`<m-sweep>`](sweep/README.md) | パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す） | values の数 − 1 | f, values, param, xr, yr, xt, yt, xl, yl, digits, dur | — |
