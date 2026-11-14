---
name: m-codetree
version: 2.0.5
series: info
tier: extra
display: ハフマン木 / Huffman tree
summary: ハフマン木で 2 値の系列を 1 語ずつ復号する（MH 符号）。ランは画素の升目に伸びる
steps: 符号語の数 ＋ まとめの 1（summary="false" なら足さない）。表にない符号か、符号の途中で終わる系列なら、その誤りに ＋1。bits が空なら 0
purposes: hierarchy, process
props: bits, depth, bit, move, fill, summary, mark, window
---

**ハフマン木**（Huffman tree）。タグとフォルダの名前は `m-codetree`・`components/codetree` のまま。

table は `[{"run", "white", "black"}]` か `{"white": {"符号": ラン}, …}`。木は表から作る。run ≥ 64 はメイクアップ符号（次も同じ色）。

- 1 ステップ = 1 符号語。`{cue}` をビットの数だけ書くと読む位置が言葉に合う。最後はまとめ
- `run` に `"EOL"`（行の終わり）も書ける。EOL の後は白から読み、画素は塗らない
- `bits`：復号する系列（0 と 1。JSON の `bits` より先）。`depth`：畳まずに見せる深さ（既定 4）
- `bit`・`move`・`fill`：1 ビットを読む秒数（0.6）・木を広げ直す秒数（0.6）・画素の升目を塗る秒数（0.8）
- `summary="false"`：最後のまとめのステップを作らない。`mark`：data-mark の頭（既定 `ct`）
- `window`：木を見せる段の数。`auto`（既定）は入らないときだけ、たどる点を追って木を流す。2 以上の数 N なら、N 段より深い木を流す
- data-mark：`ct-bit-3` `ct-cw-2`（2 語目）`ct-w-1101`（白の木の節）`ct-w64`（白の葉 64）`ct-run-1` `ct-bad`

画面の文言は文書の言語（ja なら日本語、それ以外は英語）に従い、JSON の `labels` で変えられる（index.js の頭の説明）。サンプルは `demo.html`（ITU-T T.4 の MH 符号表で 11011011111、表にない符号に出会う小さな表）。
<!-- llm: omit -->
先のステップを薄く見せる表示（`ctx.preview`）：先の符号語の下の画素の列とビットの括弧（と名前）を薄く見せる。木の上の先の道は見せない（木の窓と配置がステップごとに動くので、今の配置に先の道の場所がない）
<!-- llm: end -->
