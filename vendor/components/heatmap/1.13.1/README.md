---
name: m-heatmap
series: academic
summary: ヒートマップ。値で塗ったセルの格子（混同行列・相関行列・注意の重み）
steps: rows：行を 1 つずつ（normalize="row" の既定）。whole：全体を 1 段階。cells：全体、それから強調を 1 つずつ（highlight があるときの既定）
purposes: compare, correlation
variants: fade, sweep
props: scale, center, range, tone, lowtone, normalize, show, numbers, diag, build, rotate, xl, yl, unit, digits, dur
---

子の JSON：`{"rows": [行の名前], "cols": [列の名前], "values": [[…], …]}`。`highlight: [[行, 列], …]`（0 から。3 つ目に段階）で --emph の枠。

- 混同行列：`normalize="row" diag="on"`（数字は `show` で割合・数・両方）
- 相関行列：`scale="diverging" range="[-1,1]"`（center の上下で 2 色）
- 書かなければ最初の見せ方（fade）

<!-- llm: omit -->
作る人向けの注

- 色はテーマの色だけ：セルは `color-mix(in oklab, var(--term) p%, var(--bg))`（diverging の下側は lowtone）。p は値の位置（sequential は [min(0, 最小), 最大]、diverging は center から遠い方の端までを対称に、`range` で決め打ち）。セルの色は尺度のとおりで動かさない（色がデータなので）。数字の色はセルごとに --fg と --bg のコントラストを計算して高い方。明るさが中くらいの帯ではどちらも 4.5:1 に届かないので、その数字にだけ反対の色の 3 px の縁（`paint-order: stroke`）を付ける。tools/test-heatmap.mjs が 3 つのテーマで全部のセルを測る
- 凡例の帯は格子の右：上が最大、真ん中が center（sequential は範囲の真ん中）、下が最小。帯が 90 px より低ければ真ん中の数を出さない
- 字は 26 px、入らなければ 24 px（それより小さくしない）。列の名前が長ければ縦（`rotate="auto"`）。それでも入らなければ k 個おきに出して `console.warn`（行も同じ）。セルは正方形で 180 px まで
- セルの数字：12×12 を超えると自動で消える（`console.warn`。`numbers="on"` なら入る限り出す）。24 px で入らなければ消す。`show="both"` が 2 行で入らなければ割合だけ
- 対角（`diag="on"`）は --fg、強調は --emph の枠。どちらも地の色の太い線の上に引く（濃いセルでも薄いセルでも見える）。build="rows" で対角の枠はその行と一緒、強調は全部の行の後に 1 段階でまとめて
- 行・列の名前・凡例・空の格子は段階 0 から出ている。授業の表示（`ctx.preview`）では先の段階のセルと枠をテーマの `--preview-opacity`（ないときは 0.45）で見せる
- 見せ方：`fade`（0）は同じ段階のセルがそろってフェード、`sweep` は左上から斜めの順に（同じ段階の長さの中で終わる。動く距離はない）
- 読める層：値の表（`<table>`。ふつうの見えない層の書き方（position:absolute・1 px・clip・overflow hidden）で、画面にも印刷にも出ない。強調したセルに「（強調）」）。描いた図は aria-hidden
- `unit` と `digits` は子の JSON にも書ける（属性が勝つ）。`digits` を書かなければ値の小数桁（2 桁まで）。割合は `digits` 桁（既定 0）
<!-- llm: end -->
