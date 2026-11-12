<!-- generated; do not edit by hand -->
# data のパーツ

指示の版：303b7661

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-balance>` | 確率の重りを置き、支点が期待値でつり合う様子を示す | 数直線と重り→支点を期待値へ→値と和の式（3 ステップ） | `{values:num[],probs:num[],name?:str}` |
| `<m-ci>` | 正規標本の区間を重ね、母平均を含む割合で信頼水準を説明する | 軸と μ→区間を順に→含む数と外れの強調（3 ステップ） | `{mu:num,sigma:num,n:num,reps?:num,level?:num,seed?:num}` |
| `<m-code>` | 短いコードを行ごとに説明し、最後に出力を見せる | コード全体→説明を順に→出力（説明数＋1、出力ありは＋2） | `{code:str,lang?:str,output?:str,steps:{lines:(int\|[int,int])[],note}[]}` |
| `<m-folds>` | 検証用の区画を順に替え、各分割の誤差と平均を示す | 分割を 1 行ずつ→平均（k + 1 ステップ） | `{k:num,errors?:num[],labels?:str[]}` |
| `<m-mapping>` | 実験の結果を数値へ対応させ、同じ値になる結果をまとめて確率分布を作る | 結果の札→対応の矢印→同じ値の色と個数・確率の和→分布の横棒の 4 ステップ | `{outcomes:{label,x:num,p?:num,balls?:str[]}[],name?:str,unit?:str,fractions?:bool,picture?:"dots"\|"dice"\|"coins"\|"grapes"\|"balls"}` |
| `<m-sampling>` | 母集団から標本を取り、比率・平均の標本分布を積む | 母集団→抽出→統計量と点→反復の 4 ステップ | `{balls?:object,values?:num[],of?:str,n:num,replace?:bool,repeat?:num,seed?:num,stat?:"mean"\|"proportion",digits?:num} (balls or values)` |

### `<m-balance>`

データ（子の `<script type="application/json">`）の見本: `{"values":[0,1,2,3],"probs":[0.1,0.3,0.4,0.2],"name":"X"}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `digits` | number | `2` | 期待値の小数桁 |
| `size` | number | `0` | 文字 px（0 は 26） |

`<m-balance style="height:440px">` の子に JSON を置く。

- `values`：異なる数 2〜12 個
- `probs`：同数の確率。合計 1（±1e-9）、外れは報告して描く
- `name`：変数名（X）

### `<m-ci>`

データ（子の `<script type="application/json">`）の見本: `{"mu":50,"sigma":10,"n":25,"reps":40,"level":0.95,"seed":2}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `0` | 文字 px（0 は 26） |

`<m-ci style="height:440px">` の子に JSON を置く。

- `mu`, `sigma`, `n`：母平均、正の母標準偏差、正の整数の標本数
- `reps`：正の整数の区間数（40）。`level`：0〜1 の間（0.95）。`seed`：整数（2）

### `<m-code>`

データ（子の `<script type="application/json">`）の見本: `{"lang":"python","code":"import pandas as pd\ndf = pd.read_csv(\"sales.csv\")\ndf.groupby(\"store\")[\"sales\"].mean()","steps":[{"lines":[1],"note":"pandas を読み込む"},{"lines":[2],"note":"CSV を表として読む"},{"lines":[3],"note":"店ごとの平均"}],"output":"store\nA    120.5\nB     98.0"}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `0` | 文字 px（0 は既定） |
| `outputPos` | enum | `"auto"` | 出力の位置 |

`<m-code style="height:440px">` の子に JSON を置く。

- `code`：1184px 幅・24px で半角約 76 字/行。高さ ≈ 132 + 34×行 + 35×(説明一覧の行 − 1)、一覧は 1 行約 40 字。440px を超すなら行を減らすか分ける
- `lang`：言語の札。`steps[{lines,note}]`：行は 1 始まり、`"lines":[3]` か範囲 `[3,4]`（両端を含む）、短い説明
- `output`：省略可の出力文字列（8 行まで）

台本はコードを読み上げない。その行が何をするかを言葉で言う（変数名や記号は 1 つずつなら書いてよい）。

### `<m-folds>`

データ（子の `<script type="application/json">`）の見本: `{"k":5,"errors":[0.21,0.18,0.25,0.19,0.22],"labels":["1","2","3","4","5"]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `0` | 文字 px（0 は 26） |

`<m-folds style="height:440px">` の子に JSON を置く。

- `k`：分割数 2〜10 の整数。既定文字で k = 5 は高さ 316px 以上（誤差なし 264px）
- `errors`：省略可。k 個の非負誤差
- `labels`：省略可。k 個の区画名（既定 1〜k）

### `<m-mapping>`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `stagger` | number | `0.15` | ステップ 2 の矢印ごとの開始のずれ（秒。0 以上） |
| `digits` | number | `2` | 分数でない確率の小数桁（0〜10 の整数） |
| `size` | number | `0` | 文字の大きさ（px。0 は既定の 26、指定時は 24 以上） |

確率変数を「結果を数に対応させる規則」として見せる（結果 → 値 → 分布）。

```html
<m-mapping style="height:440px"><script type="application/json">{"outcomes":[{"label":"表表","x":2},{"label":"表裏","x":1},{"label":"裏表","x":1},{"label":"裏裏","x":0}],"picture":"coins"}</script></m-mapping>
```

- `outcomes`：2〜12 個。`label`、`x`（数）、`p`（省略すれば等確率。合計が 1 でなければ知らせる）
- `name`（既定 X）・`fractions`（既約分数）
- `picture`：`dots`・`grapes`（x 個）・`dice`（label の目）・`coins`（◯表 ●裏）・`balls`（色の名前の列。基本の 11 色、名前も書く）

### `<m-sampling>`

データ（子の `<script type="application/json">`）の見本: `{"values":[1,2,3,4,5,6],"n":2,"replace":true,"repeat":40,"seed":3}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `0` | 文字 px（0 は 26） |

母集団→標本→標本分布を説明する。`<m-sampling style="height:440px">` の子に JSON を置く。

- `balls`：色名と個数の辞書、計 2〜30 個。`of` の色の比率。基本 11 色の日英名、未知色は報告して灰色と名前
- `values`：2〜30 個の数。標本平均。`balls` とどちらか一方
- `n`：標本数。非復元は 1〜母集団数、復元は 1〜30。範囲外は報告して補正
- `replace`：戻すなら true、既定 false。`repeat`：1〜200 回（既定 40）。`seed`：整数（既定 1）
- `stat`：既定は玉で proportion、数で mean。`digits`：小数桁 0〜10（既定 2）
