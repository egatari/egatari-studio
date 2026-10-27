---
name: m-market
series: business
summary: 市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる
steps: rings の数
purposes: part-whole
props: unit, digits, scale, layout, dur, count
---

市場の大きさを、全体（TAM）から手の届く範囲（SAM）、最初に取る範囲（SOM）へ絞り込んで見せるときに使う
（motion-slides スキル §6「絞り込む」）。

子の JSON：`{"rings": [{"key": "TAM", "value": 2400, "basis": "…", "tone": "term"}, …]}`（外から順）。

- 段階 j で j 番目の円が、1 つ外の円の大きさと位置から縮んで現れる。前の円はそのまま残る
- 名前（`key`）・値・根拠（`basis`、何を数えたか）は円の右に書き、円の中の点から引き出し線で結ぶ。値は `digits` 桁で 3 桁ごとにカンマを入れ、`unit` を後ろに付ける
- `scale="fixed"`（既定）は見やすい決まった比（1・0.64・0.34・0.16）。`scale="area"` は面積を値に比例させる（小さすぎる円は最も大きい円の 0.14 倍の半径にする）。面積に比例させると SOM がほとんど見えないことが多いので、既定は fixed にして値を字で示す
- `layout="bottom"`（既定）は円の下端をそろえ、`layout="center"` は同心にする
- 色は外の 2 つが `--term`、内の円が `--emph`（`tone` で変えられる）
- 値の数字は円が縮みきってから出す。`count="true"` なら縮みに合わせて数え上げる

見本は `demo.html`（報告書の市場、面積に比例させた例）。数値はすべて架空。
