<!-- generated; do not edit by hand -->
# stats parts

Instruction version: 303b7661

| part | what it shows | steps | data shape |
|---|---|---|---|
| `<m-boxplot>` | 箱ひげ図。値を並べ、中央値・四分位数を求める手順のとおりに組み立てる。群を並べて比べる | steps（既定）：点 → 中央値 → 第1・第3四分位数 → 箱 → ひげ。whole：群 1 つ = 1 ステップ | `{groups:[{label?,tone?,values?:num[],five?:num[]} (values or five),…]}` — groups [{label, tone, values}] or [{label, five: [min, q1, median, q3, max]}]; axes go in attributes (xr="[0,20]" xl="…") |
| `<m-heatmap>` | ヒートマップ。値で塗ったセルの格子（混同行列・相関行列・注意の重み） | rows：行を 1 つずつ（normalize="row" の既定）。whole：全体を 1 ステップ。cells：全体、それから強調を 1 つずつ（highlight があるときの既定） | `{rows:str[],cols:str[],values:num[][],unit?:str,digits?:num,highlight?:num[][]}` — values[row][col], one row per label in rows and one number per label in cols; highlight [[row, col] or [row, col, step]] (0-based) |
| `<m-hist>` | ヒストグラム・度数折れ線・ドットプロット。平均値・中央値・最頻値の線も | 分布（系列 1 つ = 1 ステップ）→ 度数折れ線 → 代表値を 1 つずつ | `{values?:num[],table?:{from:num,to:num,count:int}[],bins?:{start:num,width:num},series?:[{label?,tone?,values?:num[],table?:{from:num,to:num,count:int}[]} (values or table),…]} (values or table or series)` — raw values with bins {start, width} (the part counts), or a frequency table [{from, to, count}]; up to 2 series [{label, tone, values \| table}] |
| `<m-seq>` | 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す） | ceil((steps の数 − 1) / per-step) | `{xs:num[],steps:{dens:num[],readout?:object,mark?:num}[],digits?:object,markLabel?:str}` |

### `<m-boxplot>`

Data example (child `<script type="application/json">`): `{"groups":[{"label":"1 組","values":[3,5,6,7,8,9,10,12,13,15,18]}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `orient` | string | `"h"` | h（横向きの箱、値の軸が横）か v（縦向き） |
| `xr` | json | `null` | 横軸の範囲 |
| `yr` | json | `null` | 縦軸の範囲 |
| `xt` | json | `null` | 横軸の目盛り |
| `yt` | json | `null` | 縦軸の目盛り |
| `xf` | number |  | 横軸の目盛りの小数桁 |
| `yf` | number |  | 縦軸の目盛りの小数桁 |
| `xl` | string | `""` | x axis name (`*italic*` `_sub` `^sup`) * |
| `yl` | string | `""` | y axis name * |
| `method` | string | `"jp"` | 四分位数の求め方：jp（教科書）・inc・exc（表計算の QUARTILE.INC / EXC） |
| `outliers` | string | `"off"` | on：1.5×四分位範囲の外を外れ値（点）にし、ひげはその内側まで |
| `dots` | string | `"off"` | on：値の点を箱の下に並べる（build=\ |
| `build` | string | `"steps"` | steps（求める手順のとおり）か whole（群 1 つ = 1 ステップ） |
| `unit` | string | `""` | 書き出す値の後ろに付ける単位 |
| `digits` | number |  | 書き出す値の小数桁（書かなければ値の桁＋1 まで） |

値の代わりに `"five": [最小値, 第1四分位数, 中央値, 第3四分位数, 最大値]` も書ける。

- `orient`：`h`（既定）か `v`
- `method`：`jp`（既定、教科書）・`inc`・`exc`（表計算の QUARTILE.INC / EXC）
- `outliers="on"`：1.5×四分位範囲の外を外れ値の点に
- `dots="on"`：値の点を並べる
- 群が 1 つの steps では、並べた値の行も出る

### `<m-heatmap>`

Data example (child `<script type="application/json">`): `{"rows":["ねこ","いぬ"],"cols":["ねこ","いぬ"],"values":[[45,5],[6,44]]}`

| prop | type | default | meaning |
|---|---|---|---|
| `scale` | string | `"sequential"` | sequential か diverging（center を地の色に 2 色） |
| `center` | number | `0` | diverging の真ん中の値 |
| `range` | json | `null` | 色の範囲 [最小, 最大] |
| `tone` | string | `"term"` | 濃い側の色：term・emph・accent2。書かなければテーマの色の階調（なければ term） |
| `lowtone` | string | `"emph"` | diverging の center より下の色 |
| `normalize` | string | `"none"` | row：行ごとの割合（混同行列） |
| `show` | string | `"percent"` | normalize=row の数字：percent・count・both |
| `numbers` | string | `"auto"` | セルの数字：auto・on・off |
| `diag` | string | `"off"` | on：対角を枠で強調 |
| `build` | string | `""` | rows・whole・cells |
| `rotate` | string | `"auto"` | 列の名前：auto・0・90 |
| `xl` | string | `""` | 列の見出し |
| `yl` | string | `""` | 行の見出し |
| `unit` | string |  | セルの数字の後ろに付ける単位（JSON の unit より先） |
| `digits` | number |  | セルの数字の小数桁（既定は値の桁、2 桁まで。割合は 0） |

`highlight: [[行, 列], …]`（0 から。3 つ目にステップ）で --emph の枠。

- 混同行列：`normalize="row" diag="on"`（数字は `show` で割合・数・両方）
- 相関行列：`scale="diverging" range="[-1,1]"`（center の上下で 2 色）
- 書かなければ最初の見せ方（fade）

### `<m-hist>`

Data example (child `<script type="application/json">`): `{"values":[23,31,27,18,25,29,33,22,26,28],"bins":{"start":15,"width":5}}`

| prop | type | default | meaning |
|---|---|---|---|
| `xr` | json | `null` | 横軸の範囲（書かなければ階級から） |
| `yr` | json | `null` | 縦軸の範囲（書かなければ度数から） |
| `xt` | json | `null` | 横軸の目盛り（書かなければ階級の境） |
| `yt` | json | `null` | 縦軸の目盛り（書かなければ自動） |
| `xf` | number |  | 横軸の目盛りの小数桁 |
| `yf` | number |  | 縦軸の目盛りの小数桁 |
| `xl` | string | `""` | x axis name (`*italic*` `_sub` `^sup`) * |
| `yl` | string | `""` | y axis name * |
| `unit` | string | `""` | 代表値の数の後ろに付ける単位 |
| `digits` | number |  | 代表値の小数桁（書かなければ値の桁＋1 まで） |
| `polygon` | string | `"off"` | on：度数折れ線 |
| `relative` | string | `"off"` | on：相対度数 |
| `cumulative` | string | `"off"` | on：累積度数 |
| `kind` | string | `"bars"` | bars（柱状グラフ）か dots（ドットプロット） |
| `marks` | string | `""` | 代表値の印：mean,median,mode のどれか（書いた順に 1 つずつ） |
| `build` | string | `"whole"` | whole・values（値を 1 つずつ数える）・bins（階級を 1 つずつ） |

子の JSON の並び：パーツが数える。か `{"table": [{"from", "to", "count"}]}`。2 組なら `"series": [{"label", "values" か "table"}]`（重ねる）。

- 階級は start 以上 start＋width 未満
- `kind="dots"`：ドットプロット（values が要る）
- `polygon` `relative` `cumulative`：`"on"`
- `marks="mean,median,mode"`：代表値の線
- `build="values"`：値を 1 つずつ積む。`"bins"`：階級を 1 つずつ

### `<m-seq>`

Data example (child `<script type="application/json">`): `{"xs":[-2,-1,0,1,2],"steps":[{"dens":[0.05,0.24,0.4,0.24,0.05],"readout":{"n":0}},{"dens":[0.02,0.2,0.5,0.2,0.02],"readout":{"n":1},"mark":0.3}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `per-step` | number | `1` | 1 ステップで動かす更新の回数 |
| `xr` | json | `null` | 横軸の範囲（既定は xs の端） |
| `yr` | json | `[0, 1]` | y range [min, max] * |
| `xt` | json | `[]` | x tick values * |
| `yt` | json | `[]` | y tick values * |
| `xf` | number |  | x tick decimals * |
| `yf` | number |  | y tick decimals * |
| `xl` | string | `""` | x axis name (`*italic*` `_sub` `^sup`) * |
| `yl` | string | `""` | y axis name * |
| `digits` | number | `2` | 数値の小数の桁数（data.digits で名前ごとに上書き） |
| `panel` | number | `250` | 右の数値の欄の幅（px） |
| `ghosts` | number | `99` | 残す前の分布の数 |

回答や観測を 1 個ずつ加えて、事後分布と推定値が絞られていく過程を見せるときに使う。

`xl` `yl` `yr` などの軸の設定は JSON にも書ける（属性があれば属性を優先）。

- `steps[0]` が始めの状態（ステップ 0）、`steps[1..]` が 1 回ずつの更新
- `per-step` 回の更新を 1 ステップの中で順に動かす。1 回の長さは `slot` 秒、`cues(k)` は各更新の開始時刻を返すので、
  台本の `{cue}` を更新の数だけ置けば、音声に合わせて 1 回ずつ動く
- 数値は前後の値の間を補間し、`digits` の桁でそろえて表示する（等幅の数字）
