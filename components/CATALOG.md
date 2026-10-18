# 部品の一覧

`node tools/catalog.mjs` が各部品の README.md の先頭から作る。手で直さない。

| 部品 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|
| [`<m-bars>`](bars/README.md) | 棒を段階ごとに 0 から伸ばす（縦棒・横棒・組の棒）。値の軸の上限を段階で広げて「軸を突き抜ける伸び」も見せられる | 組の step と scale の step の最大（既定は組 1 つ = 1 段階。per-step で n 組ずつ） | orient, max, unit, digits, per-step, dur, stagger, count, ticks, zoom, al | [demo](bars/demo.html) |
| [`<m-codetree>`](codetree/README.md) | 符号の木で 2 値の系列を 1 語ずつ復号する（MH 符号）。ランは画素の升目に伸びる | 符号語の数 ＋ まとめの 1 | bits, depth, bit | [demo](codetree/demo.html) |
| [`<m-collect>`](collect/README.md) | 並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる | 1 | move, stagger, shrink, chip-w, chip-h, box-w, box-h | [demo](collect/demo.html) |
| [`<m-curves>`](curves/README.md) | 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く） | 系列の数 | xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw | [demo](curves/demo.html) |
| [`<m-flow>`](flow/README.md) | 流れ図の箱と矢印を段階ごとに出して、図を組み立てる | nodes と edges の step の最大 | fade, draw, size, pulse-dur, pulse-n, label-gap | [demo](flow/demo.html) |
| [`<m-gendai>`](gendai/README.md) | 現代文の読解の図：傍線・二重傍線を引き、指示語から指す内容へ矢印、段落を役割（主張・具体例・対比）の枠で囲んで線でつなぐ | 中身のある phases の数（既定 marks refs roles） | size, tate, phases, draw | [demo](gendai/demo.html) |
| [`<m-kanbun>`](kanbun/README.md) | 白文に返り点・送り仮名を付け、訓読の順に字をたどり（返り点で上へ戻るところに弧）、書き下し文にする（縦書き） | phases の数（既定 3：訓点・読む順・書き下し文） | size, slot, phases, kaki, nums | [demo](kanbun/demo.html) |
| [`<m-kobun>`](kobun/README.md) | 古文を語に切り（スラッシュ）、品詞で色を分けて 1 文ずつ見せ、最後に現代語訳と並べる。助動詞を押すと活用表と意味 | 文の数（現代語訳があれば ＋1） | size, tate, yaku, fade, detail | [demo](kobun/demo.html) |
| [`<m-kpi>`](kpi/README.md) | 大きな数字の札（KPI）を段階ごとに出す。数字は数え上げ、下に増減の矢印と一言 | 札の step の最大（既定は札 1 枚 = 1 段階。per-step で n 枚ずつ） | cols, digits, per-step, dur, stagger, count, size | [demo](kpi/demo.html) |
| [`<m-market>`](market/README.md) | 市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる | rings の数 | unit, digits, scale, layout, dur, count | [demo](market/demo.html) |
| [`<m-menu>`](menu/README.md) | スライドへのリンクの札を格子に並べる（目次・単元の選び方）。札はふつうの <a href="#<スライドの id>">、行ったスライドの札に「見た」の印 | ceil(札の数 / per-step)（既定の per-step="0" なら 0：初めから全部） | cols, per-step, size, fade, stagger, visited | [demo](menu/demo.html) |
| [`<m-quad>`](quad/README.md) | 2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）に、点を段階ごとに 1 つずつ置く | 点の step と to.step の最大（既定は点 1 つ = 1 段階） | fade, move, size, quads-step | [demo](quad/demo.html) |
| [`<m-seq>`](seq/README.md) | 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す） | ceil((steps の数 − 1) / per-step) | per-step, slot, xr, yr, xt, yt, xf, yf, xl, yl, digits, panel, ghosts | [demo](seq/demo.html) |
| [`<m-sweep>`](sweep/README.md) | パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す） | values の数 − 1 | f, values, param, xr, yr, xt, yt, xl, yl, digits, dur | — |
