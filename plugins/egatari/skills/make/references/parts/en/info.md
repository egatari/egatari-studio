<!-- generated; do not edit by hand -->
# info parts

Instruction version: ecca7b6f

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-codetree>` | 符号の木で 2 値の系列を 1 語ずつ復号する（MH 符号）。ランは画素の升目に伸びる | 符号語の数 ＋ まとめの 1 | `{table, bits?, labels?}` |

### `<m-codetree>`

Data example (child `<script type="application/json">`): `{"table":[{"run":2,"white":"0111","black":"11"},{"run":64,"white":"11011","black":"0000001111"}],"bits":"110110111"}`

| prop | type | default | meaning |
|---|---|---|---|
| `bits` | string | `""` | 復号する系列（JSON の bits より先） |
| `depth` | number | `4` | 畳まずに見せる深さ（読む道はいつも広げる） |

table は `[{"run", "white", "black"}]` か `{"white": {"符号": ラン}, …}`。木は表から作る。run ≥ 64 はメイクアップ符号（次も同じ色）。

- 1 ステップ = 1 符号語。`{cue}` をビットの数だけ書くと読む位置が言葉に合う。最後はまとめ
- data-mark：`ct-bit-3` `ct-cw-2`（2 語目）`ct-w-1101`（白の木の節）`ct-w64`（白の葉 64）`ct-run-1` `ct-bad`
