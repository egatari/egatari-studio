---
name: m-matrix
display: 比較の行列 / Comparison matrix
version: 2.0.0
series: academic
tier: specialized
set: univ
summary: 研究の位置づけの表。2 本の軸の交差の表（マスに研究の名前、本研究のマスを枠で、空きマスは — と注）か、研究 × 要素の表（✓ △ × や短い字）を、ステップで埋める
steps: cross は 軸と空の表 → 従来の研究 → 本研究 → 注（order="whole" で 1）。attributes は 列・行ごと（order）＋本研究の枠
purposes: compare, position
audiences: university, working-adult
props: order, dur, size
---

`kind`：`cross`（既定、2 本の軸の交差の表）・`attributes`（行に研究、列に要素の表）。子の JSON に書く。

- cross：`rows`・`cols` は `{"axis": "軸の名前", "values": [値, …]}`（どちらも 2〜4 個）。`cells[r][c]` は研究の名前の並び（引用番号か「著者（年）」、1〜3 本）、本研究のマスは `{"self": true}`、空きマスは `{"none": "空きの理由"}`（「—」と注の番号、表の下に注）。3 本目の軸は名前に印（† など）を付け、`marks: [{"mark": "†", "text": "意味"}]`
- attributes：`cols` は要素の名前、`rows` は `{"label", "cells", "self"}`（本研究を先頭に）。空のマスは「—」
- 本研究は「本研究」と字で書いて `--emph` の枠で囲む（色だけで分けない）
<!-- llm: omit -->
```html
<m-matrix style="height:480px"><script type="application/json">{"kind":"cross","rows":{"axis":"評価基準","values":["予測誤差","ベイズリスク"]},"cols":{"axis":"予測の形","values":["点予測","分布予測"]},"cells":[[["[1]","[2]"],["[3]"]],[{"none":"自明"},{"self":true}]]}</script></m-matrix>
```

- 見出し：cross は行の軸の名前を左上に、列の軸の名前を値の上に 1 回だけ書く。読める層（`table[data-readable]`、最後の状態）は見出しを「軸の名前：値」で書く
- 字は `size`（既定 28 px）。入らなければ 24 px まで縮め、それでも入らなければ必要な大きさを size で知らせる
- マスは `data-part` の箱、字はその札（品質チェックの重なりの点検）
- 先のステップを薄く見せる表示（`ctx.preview`）：先のマスと注を `--preview-opacity` の濃さに
<!-- llm: end -->

サンプルは `demo.html`（架空の系列予測の研究の交差の表と、同じ研究の要素の表、架空の製品の比べ方）。

注意

- 交差の表の軸は 2〜4 個ずつ。それより多いときは軸の値をまとめるか、attributes の表にする
- マスの研究は主なものを 3 本まで。全部の文献の一覧は参考文献のスライドに置く
