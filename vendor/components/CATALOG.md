# 部品の一覧

`node tools/catalog.mjs` が部品庫の写しの既定の版（`components.lock.json`）の README.md の先頭から作る。手で直さない。
部品は [egatari/components](https://github.com/egatari/components) のリリースの写し（`npm run components:update -- vX.Y.Z` で取り込む）。

| 部品 | 版 | 内容 | 段階の数 | 受け取る値 | 見本 |
|---|---|---|---|---|---|
| [`<m-bars>`](bars/1.4.0/README.md) | 1.4.0 | 棒を段階ごとに 0 から伸ばす（縦棒・横棒・組の棒・積み上げ棒）。値の軸の上限を段階で広げて「軸を突き抜ける伸び」も見せられる | 組の step と scale の step の最大（既定は組 1 つ = 1 段階。per-step で n 組ずつ） | orient, max, unit, digits, per-step, dur, stagger, count, ticks, zoom, al, stack | [demo](bars/1.4.0/demo.html) |
| [`<m-codetree>`](codetree/1.4.0/README.md) | 1.4.0 | 符号の木で 2 値の系列を 1 語ずつ復号する（MH 符号）。ランは画素の升目に伸びる | 符号語の数 ＋ まとめの 1 | bits, depth, bit | [demo](codetree/1.4.0/demo.html) |
| [`<m-collect>`](collect/1.4.0/README.md) | 1.4.0 | 並んだ札（回答など）が動いて縮み、少数の箱（要約）にまとまる | 1 | move, stagger, shrink, chip-w, chip-h, box-w, box-h | [demo](collect/1.4.0/demo.html) |
| [`<m-compare>`](compare/1.4.0/README.md) | 1.4.0 | 2 つ（3 つまで）を横に並べて比べる表。一方の列、もう一方の列、それから行ごとの違い | 列の数 + 1（違いの段階。diff も better もなければ列の数だけ） | size, dur, diff-label | [demo](compare/1.4.0/demo.html) |
| [`<m-curves>`](curves/1.4.0/README.md) | 1.4.0 | 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く） | step の最大（既定は系列の数） | xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw | [demo](curves/1.4.0/demo.html) |
| [`<m-cycle>`](cycle/1.4.0/README.md) | 1.4.0 | 循環の図。段階の箱を円の上に 12 時から時計回りに並べ、円に沿った矢印でつなぐ（最後から最初へ戻る矢印も） | 段階の数（既定は 1 つ = 1 段階。per-step で n 個ずつ、node の step が優先） | per-step, size, dur, stagger | [demo](cycle/1.4.0/demo.html) |
| [`<m-fishbone>`](fishbone/1.4.0/README.md) | 1.4.0 | 原因と結果の図（特性要因図・フィッシュボーン図）を、大骨 1 本ずつ組み立て、最後に結果（頭）を出す。座標は書かず、配置は部品が決める | 大骨の数 + 1（頭）。節と edges の step があればその最大 | order, size, fade, draw | [demo](fishbone/1.4.0/demo.html) |
| [`<m-flow>`](flow/1.4.0/README.md) | 1.4.0 | 流れ図の箱と矢印を段階ごとに出して、図を組み立てる | nodes と edges の step の最大 | fade, draw, size, pulse-dur, pulse-n, label-gap | [demo](flow/1.4.0/demo.html) |
| [`<m-gendai>`](gendai/1.4.0/README.md) | 1.4.0 | 現代文の読解の図：傍線・二重傍線を引き、指示語から指す内容へ矢印、段落を役割（主張・具体例・対比）の枠で囲んで線でつなぐ | 中身のある phases の数（既定 marks refs roles） | size, tate, phases, draw | [demo](gendai/1.4.0/demo.html) |
| [`<m-kanbun>`](kanbun/1.4.0/README.md) | 1.4.0 | 白文に返り点・送り仮名を付け、訓読の順に字をたどり（返り点で上へ戻るところに弧）、書き下し文にする（縦書き） | phases の数（既定 3：訓点・読む順・書き下し文） | size, slot, phases, kaki, nums | [demo](kanbun/1.4.0/demo.html) |
| [`<m-kobun>`](kobun/1.4.0/README.md) | 1.4.0 | 古文を語に切り（スラッシュ）、品詞で色を分けて 1 文ずつ見せ、最後に現代語訳と並べる。助動詞を押すと活用表と意味 | 文の数（現代語訳があれば ＋1） | size, tate, yaku, fade, detail | [demo](kobun/1.4.0/demo.html) |
| [`<m-kpi>`](kpi/1.4.0/README.md) | 1.4.0 | 大きな数字の札（KPI）を段階ごとに出す。数字は数え上げ、下に増減の矢印と一言 | 札の step の最大（既定は札 1 枚 = 1 段階。per-step で n 枚ずつ） | cols, digits, per-step, dur, stagger, count, size | [demo](kpi/1.4.0/demo.html) |
| [`<m-map-japan>`](map-japan/1.4.0/README.md) | 1.4.0 | 日本の 47 都道府県の地図。地域の強調、統計の塗り分け、点、矢印、経度・緯度の重ね描きを段階ごとに出す | 項目の step の最大（既定 1）。地図そのものは段階 0 から出ている | layout, labels, show, unit, digits, legend, dur | [demo](map-japan/1.4.0/demo.html) |
| [`<m-market>`](market/1.4.0/README.md) | 1.4.0 | 市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる | rings の数 | unit, digits, scale, layout, dur, count | [demo](market/1.4.0/demo.html) |
| [`<m-menu>`](menu/1.4.0/README.md) | 1.4.0 | スライドへのリンクの札を格子に並べる（目次・単元の選び方）。札はふつうの <a href="#<スライドの id>">、行ったスライドの札に「見た」の印 | ceil(札の数 / per-step)（既定の per-step="0" なら 0：初めから全部） | cols, per-step, size, fade, stagger, visited | [demo](menu/1.4.0/demo.html) |
| [`<m-pie>`](pie/1.4.0/README.md) | 1.4.0 | 円グラフとドーナツグラフ。切れの名前と値・割合は、大きい切れなら中に、小さい切れなら外に引き出し線で書く | 既定は 1（全部を一度に）。per-step で n 切れずつ、切れの step で直接 | donut, unit, digits, pct-digits, show, per-step, dur | [demo](pie/1.4.0/demo.html) |
| [`<m-quad>`](quad/1.4.0/README.md) | 1.4.0 | 2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）に、点を段階ごとに 1 つずつ置く | 点の step と to.step の最大（既定は点 1 つ = 1 段階） | fade, move, size, quads-step | [demo](quad/1.4.0/demo.html) |
| [`<m-scatter>`](scatter/1.4.0/README.md) | 1.4.0 | 散布図。点の組（系列）を段階ごとに出し、そのあと傾向の線（最小二乗の直線か、書いた 2 点）を引く | 系列の数 ＋ 傾向の線（既定は系列 1 つ = 1 段階、そのあと線をまとめて 1 段階。系列・線の step で直接） | xr, yr, xt, yt, xf, yf, xl, yl, r, dur | [demo](scatter/1.4.0/demo.html) |
| [`<m-seq>`](seq/1.4.0/README.md) | 1.4.0 | 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す） | ceil((steps の数 − 1) / per-step) | per-step, slot, xr, yr, xt, yt, xf, yf, xl, yl, digits, panel, ghosts | [demo](seq/1.4.0/demo.html) |
| [`<m-sweep>`](sweep/1.4.0/README.md) | 1.4.0 | パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す） | values の数 − 1 | f, values, param, xr, yr, xt, yt, xl, yl, digits, dur | [demo](sweep/1.4.0/demo.html) |
| [`<m-timeline>`](timeline/1.4.0/README.md) | 1.4.0 | 年表。出来事を時間の軸の上に 1 つずつ出す。期間は帯にして、重なる期間は段を分けて積む。end は含まない（"1912" は 1912 年の初め） | 出来事の数（既定は時刻の順に 1 つ = 1 段階。per-step で n 個ずつ、node の step が優先） | orient, scale, per-step, size, dur, stagger | [demo](timeline/1.4.0/demo.html) |
| [`<m-tree>`](tree/1.4.0/README.md) | 1.4.0 | 階層・分類の木（組織図、生物の分類など）を、根から 1 段ずつ組み立てる。座標は書かず、配置は部品が決める | 節の深さの数（by="level"、既定）か節の数（by="node"）。節と edges の step があればその最大 | orient, by, link, size, fade, draw | [demo](tree/1.4.0/demo.html) |
| [`<m-venn>`](venn/1.4.0/README.md) | 1.4.0 | 2 つか 3 つの集合の円（ベン図）。集合を 1 つずつ出し、最後に重なりを強めてその中の項目を出す | 集合の数 + 1（overlaps="each" なら 集合の数 + 項目のある重なりの数） | size, dur, spread, overlaps | [demo](venn/1.4.0/demo.html) |
