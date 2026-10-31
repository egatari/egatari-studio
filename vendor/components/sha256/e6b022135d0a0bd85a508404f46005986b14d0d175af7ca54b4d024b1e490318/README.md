---
name: m-codetree
version: 2.0.0
series: info
tier: extra
display: 文脈木 / Context tree
summary: 符号の木で 2 値の系列を 1 語ずつ復号する（MH 符号）。ランは画素の升目に伸びる
steps: 符号語の数 ＋ まとめの 1
purposes: hierarchy, process
props: bits, depth, bit
---

**文脈木**（Context tree）。タグとフォルダの名前は `m-codetree`・`components/codetree` のまま。

table は `[{"run", "white", "black"}]` か `{"white": {"符号": ラン}, …}`。木は表から作る。run ≥ 64 はメイクアップ符号（次も同じ色）。

- 1 段階 = 1 符号語。`{cue}` をビットの数だけ書くと読む位置が言葉に合う。最後はまとめ
- data-mark：`ct-bit-3` `ct-cw-2`（2 語目）`ct-w-1101`（白の木の節）`ct-w64`（白の葉 64）`ct-run-1` `ct-bad`

詳しい属性（`move` `fill` `summary` `mark`、JSON の `labels`）は index.js の頭の説明。見本は `demo.html`（ITU-T T.4 の MH 符号表で 11011011111、表にない符号に出会う小さな表）。
<!-- llm: omit -->
授業の表示（`ctx.preview`）：先の符号語の下の画素の列とビットの括弧（と名前）を薄く見せる。木の上の先の道は見せない（木の窓と配置が段階ごとに動くので、今の配置に先の道の場所がない）
<!-- llm: end -->
