<!-- generated; do not edit by hand -->
# business parts

Instruction version: ecca7b6f

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-market>` | 市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる | rings の数 | `{rings: [{key?, value, basis?, tone?}, …]}` |

### `<m-market>`

Data example (child `<script type="application/json">`): `{"rings":[{"key":"TAM","value":3000,"basis":"国内の…"},{"key":"SAM","value":600,"basis":"…"},{"key":"SOM","value":30,"basis":"…"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `unit` | string | `""` | 値の単位（数字の後ろに付ける） |
| `digits` | number | `0` | 値の小数桁 |
| `scale` | string | `"fixed"` | fixed（決まった比）か area（面積を値に比例） |
| `layout` | string | `"bottom"` | bottom（下端をそろえる）か center（同心） |
| `count` | bool | `false` | 値の数字を縮みに合わせて数え上げる |

市場の大きさを、全体（TAM）から手の届く範囲（SAM）、最初に取る範囲（SOM）へ絞り込んで見せるときに使う。

子の JSON の並び：外から順。

- ステップ j で j 番目の円が、1 つ外の円の大きさと位置から縮んで現れる。前の円はそのまま残る
- 名前（`key`）・値・根拠（`basis`、何を数えたか）は円の右に書き、円の中の点から引き出し線で結ぶ。値は `digits` 桁で 3 桁ごとにカンマを入れ、`unit` を後ろに付ける
- `scale="fixed"`（既定）は見やすい決まった比（1・0.64・0.34・0.16）。`scale="area"` は面積を値に比例させる（小さすぎる円は最も大きい円の 0.14 倍の半径にする）。面積に比例させると SOM がほとんど見えないことが多いので、既定は fixed にして値を字で示す
- `layout="bottom"`（既定）は円の下端をそろえ、`layout="center"` は同心にする
- 色は外の 2 つが `--term`、内の円が `--emph`（`tone` で変えられる）
- 値の数字は円が縮みきってから出す。`count="true"` なら縮みに合わせて数え上げる

お金・モノの流れ（ビジネスモデルの図）のための edge の欄（書かなければこれまでと同じ）：

- `kind`：`money`（`--emph` の太線）・`service`（`--term`）・`data`（`--muted` の破線）。`tone` と `dash` を書けばそちらが勝つ
- `amount`：金額などを太字で添える。`label` もあれば線の反対の側に書く
- `shift`：線に垂直に（進む向きの右へ）ずらす px。同じ 2 つの箱の行きと帰りを `shift` を同じ値にして 2 本並べる。字はずらした側に書く
- `pulse`：点の列（`pulse-n` 個、0.22 秒おき）が始点から終点へ `pulse-dur` 秒で流れる。`true` なら辺のステップに（引き終わってから）1 回、`[ステップ, …]` ならそのステップごとに 1 回（辺のステップでなければ `pulseAt` 秒、既定 0.2 秒から）。位置は (k, t) だけで決まり、流れ終わると消える（最終状態には出ない）。`pulse` のステップは図のステップの数にも数える
- `cues(k)`：pulse の開始時刻を返す（pulse のない図はこれまでどおり null）。台本の `{cue}` の数と合えば、「お金は〜から〜へ{cue}」に合わせて流れる
