---
name: m-matrix
display: 比較の行列 / Comparison matrix
version: 2.1.0
series: academic
tier: specialized
set: univ
summary: 研究の位置づけの表。2 本の軸の交差の表（マスに研究の名前、本研究のマスを枠で結論の 1 文と、空きマスは — と注、下に設計の行）か、研究 × 要素の表（✓ △ × や短い字、列の上に要件の出どころ）を、ステップで埋める
steps: cross は 軸と空の表（0）→ 従来（1）→ 本研究（2）→ 注（3、none のマスがあるときだけ）、order="whole" で 1。attributes は whole で 1、col・row で 列・行の数 + 1（枠）
purposes: compare, position
audiences: university, working-adult
props: order, dur, size
---

`kind`：`cross`（既定、2 本の軸の交差の表）・`attributes`（行に研究、列に要素の表）。子の JSON に書く。

- cross：`rows`・`cols` は `{"axis": "軸の名前", "values": [値, …]}`（どちらも 2〜4 個）。`cells[r][c]` は研究の名前の並び（引用番号か「著者（年）」、1〜3 本）、本研究のマスは `{"self": true}`、空きマスは `{"none": "空きの理由"}`（「—」と注の番号、表の下に注）。3 本目の軸は名前に印（† など）を付け、`marks: [{"mark": "†", "text": "意味"}]`
  - `{"self": "分かったことの 1 文"}` で本研究のマスに結論も書く（40 字まで）
  - `design: {"cols": [2〜3 個], "rows": [{"label", "cells"}, {"self": true, "cells"}]}`：表の下の設計の行（従来と本研究のデータ・識別の設計と、比べられるようになったこと）
- attributes：`cols` は要素の名前か `{"name", "source"}`（要件が来た応用の必要）、`rows` は `{"label", "cells", "self"}`（本研究を先頭に）。空のマスは「—」。記号の意味は `marks`（● 満たす・× 満たさない・— 記載なし）
- 本研究は「本研究」と字で書いて `--emph` の枠で囲む（色だけで分けない）

型の選び方（新しさの在りか）：問題の記述（目的・設定・入力・出力・評価基準）なら cross（問いと対象なら結論の 1 文、観測・識別なら design も）、応用の要件を満たす手法なら attributes に出どころと ● × —。答えの値や見方が新しいなら、この表にしない（m-contrast、前提ごとなら m-tree の `dash`）。どれも最も近い従来研究 1〜2 件を表の中で名指しする

<!-- llm: omit -->
```html
<m-matrix style="height:480px"><script type="application/json">{"kind":"cross","rows":{"axis":"評価基準","values":["予測誤差","ベイズリスク"]},"cols":{"axis":"予測の形","values":["点予測","分布予測"]},"cells":[[["[1]","[2]"],["[3]"]],[{"none":"自明"},{"self":true}]]}</script></m-matrix>
```

- 見出し：cross は行の軸の名前を左上に、列の軸の名前を値の上に 1 回だけ書く。読める層（`table[data-readable]`、最後の状態）は見出しを「軸の名前：値」で書く
- 字は `size`（既定 28 px）。入らなければ 24 px まで縮め、それでも入らなければ必要な大きさを size で知らせる
- マスは `data-part` の箱、字はその札（品質チェックの重なりの点検）
- 先のステップを薄く見せる表示（`ctx.preview`）：先のマスと注を `--preview-opacity` の濃さに
- 本研究の 1 文・設計の行・出どころは列の幅で折り返す（助詞の後や「、」で切り、行の長さをそろえる）。切る所を決めたいときは `\n`
<!-- llm: end -->

サンプルは `demo.html`（架空の時系列予測の研究の交差の表と、同じ研究の要素の表、架空の製品の比べ方、架空の学力の差の研究の交差の表と設計の行、架空の自動採点の方法の要件の表）。

注意

- 交差の表の軸は 2〜4 個ずつ。それより多いときは軸の値をまとめるか、attributes の表にする
- マスの研究は主なものを 3 本まで。全部の文献の一覧は参考文献のスライドに置く
- 要件を本研究に有利な語で作らない（本研究だけが全部 ● の表は、選び方しだいで必ず作れる）
