<!-- generated; do not edit by hand -->
# math parts

Instruction version: b47ccdba

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-hissan>` | 筆算（たし算・ひき算・かけ算・わり算、小数も）。式を書けば、パーツが教科書の手順で計算して書く | ＋−は位ごと、×は 1 段ごと（fine で 1 けたずつ）→たす、÷は商 1 けたごと（per="phase" で たてる・かける・ひく・おろす ごと） | attributes only (no JSON child): `digits="2"` |
| `<m-numberline>` | 数直線。点・□・ジャンプ・不等式の範囲・0.1 の拡大。2 本で比例数直線 | build の順（既定 ticks,marks,links,jumps,ranges,magnify）に項目 1 つ = 1 ステップ。whole：全部で 1 ステップ | `{lines:{from:num\|str,to:num\|str,step?:num\|str,sub?:int,unit?:str,label?,labels?:str\|any[]}[],marks?:{at:num\|str,line?:int,label?,kind?:"dot"\|"open"\|"box",tone?,show?:int}[],jumps?:{from:num\|str,to:num\|str,line?:int,label?,tone?,show?:int}[],ranges?:[{from?:num\|str,to?:num\|str,incl?:[bool,bool],line?:int,label?,tone?,show?:int} (from or to),…],link?:(any[]\|object)[],magnify?:{from:num\|str,to:num\|str,step?:num\|str,labels?:str\|any[],show?:int}[]}` — lines [{from, to, step, sub, unit, label, labels}] (1 or 2); marks [{at, kind: dot\|open\|box, label}]; jumps [{from, to, label}]; ranges [{from, to, incl: [bool, bool]}]; link [[top value, bottom value]]; magnify [{from, to, step}]. Values are numbers or "1/3" |
| `<m-sweep>` | パラメータを動かして関数の形の変化を見せる（前の形は灰色で残す） | values の数 − 1 | attributes only (no JSON child): `values="[0,0.5,1]"` |
| `<m-tape>` | テープ図・線分図。全体や部分を括弧で括り、わからない量は □ か ?。行から行へ「2 倍」の矢印 | steps（既定）：行 → 括弧 → 倍の矢印を 1 つずつ。rows：行 1 つ = 1 ステップ。whole：全部で 1 ステップ | `{rows:{label?,tone?,show?:int,segs:{v:num,label?,unknown?:str}[]}[],brace?:{row:int,from:int,to:int,label?,side?:"above"\|"below",show?:int}[],times?:{from:int,to:int,label?,show?:int}[]}` — rows [{label, segs: [{v, label, unknown: "?" \| "□"}]}]; brace [{row, from, to, label, side: above\|below}] (from/to are segment numbers from 0); times [{from, to, label}] (row numbers) |

### `<m-hissan>`

Example: `<m-hissan expr="487+356"></m-hissan>`

| prop | type | default | meaning |
|---|---|---|---|
| `expr` | string | `""` | 式：487+356、1003-457、36×24、851÷23、3.6×2.4、7.56÷1.8（× は * でも、÷ は / でもよい） |
| `build` | string | `"steps"` | steps（手順ごと）か whole（1 ステップで全部） |
| `fine` | string | `"off"` | かけ算：on なら 1 けたずつ（小さなくり上がりを書く） |
| `per` | string | `"round"` | わり算：round（商 1 けた＝1 ステップ）か phase（たてる・かける・ひく・おろす を別のステップに） |
| `kari` | string | `"off"` | わり算：on なら大きすぎる仮の商を 1 回見せて直す |
| `rem` | string | `"off"` | わり算：on なら商を整数で止めて あまり を出す |
| `digits` | json | `null` | わり算：商を小数第何位まで求めるか |
| `carry` | string | `"line"` | たし算のくり上がり：line（答えの線のすぐ上）か top（上の数の上） |
| `words` | string | `"on"` | off なら右の手順の言葉を出さない |
| `focus` | string | `"on"` | いま計算している位・行に薄い色 |

`<m-hissan expr="1003-457">`。式は `487+356` `36×24` `851÷23` `3.6×2.4` `7.56÷1.8`。

- くり上がり・くり下がり・小数点・あまり はパーツが書く
- `fine="on"`：かけ算を 1 けたずつ
- `kari="on"`：仮の商を見せて 1 ずつ直す
- `carry="top"`：くり上がりを上の数の上に。`words="off"`：右の言葉を出さない
- `rem="on"`：商を整数で止めて あまり。`digits="2"`：商を小数第二位まで

### `<m-numberline>`

Data example (child `<script type="application/json">`): `{"lines":[{"from":0,"to":10,"step":1}],"marks":[{"at":3}],"jumps":[{"from":3,"to":7,"label":"+4"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `build` | string | `"ticks,marks,links,jumps,ranges,magnify"` | 出す順（種類をコンマで）か whole（全部を 1 ステップで） |
| `arrow` | string | `"off"` | on：線の右の端を矢印に |

子の JSON の値は数か `"1/3"`（分数で書く）。

- lines：1 本か 2 本（0 をそろえる）`{from, to, step, sub, label, unit, labels: "ends" | [値]}`
- marks：`{at, kind: "dot" | "open" | "box", label}`。box は □
- jumps：`{from, to, label}`（左向きも）
- ranges：`{from, to, incl: [true, false]}`。端がなければ矢印。重なれば共通部分を塗る
- link（2 本）：`[[上の値, 下の値]]` か `{at, label: "×3"}`
- magnify：`{from, to, step}`。区間を下の線に広げる（既定 10 等分）
- 項目の `line`（0 か 1。拡大の線は 1, 2, …）、`show`（ステップ）
- `arrow="on"`：右端を矢印に

### `<m-sweep>`

| prop | type | default | meaning |
|---|---|---|---|
| `f` | string | `"u*u"` | 関数の式（算術の式。変数は横軸 u とパラメータ c。Math.exp(…) などの Math の関数と定数、+ - * / % **、比較と ? : が使える） |
| `values` | json | `[0, 1]` | パラメータの値の列。ステップごとに次の値へ動く |
| `param` | string | `"c"` | 表示するパラメータの名前 |
| `xr` | json | `[-3, 3]` | x range [min, max] * |
| `yr` | json | `[0, 10]` | y range [min, max] * |
| `xt` | json | `[]` | x tick values * |
| `yt` | json | `[]` | y tick values * |
| `xl` | string | `""` | x axis name (`*italic*` `_sub` `^sup`) * |
| `yl` | string | `""` | y axis name * |
| `digits` | number | `2` | 表示する値の小数の桁数 |

「φ が大きいほど〜」を目で確かめさせるときに使う。

`f` の式の中では、動かす値はいつも `c` と書く（`param` は図に表示する名前だけ。`param="η"` でも `f="u*u + c*u"`）。

`f` は算術の式（コードとしては実行しない）：数、`u` と `c`、`Math.exp(…)` `Math.sin(…)` などの `Math` の関数と `Math.PI` などの定数、`+ - * / % **`、比較（`< <= > >= == !=`）、`&& || !`、`? :`、括弧。べき乗は `**`（`^` は書けない）。`-u ** 2` は `-(u ** 2)` か `(-u) ** 2` と書く。書けない式は図の代わりに札が出る。

### `<m-tape>`

Data example (child `<script type="application/json">`): `{"rows":[{"label":"みかん","segs":[{"v":8,"label":"食べた 8 こ"},{"v":15,"label":"のこり 15 こ"}]}],"brace":[{"row":0,"from":0,"to":1,"label":"はじめ □ こ","side":"above"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `kind` | string | `"tape"` | tape（テープ図）か line（線分図） |
| `build` | string | `"steps"` | steps（行・括弧・矢印を 1 つずつ）・rows（行を 1 つずつ。括弧と矢印はその行と）・whole（全部を 1 ステップで） |

- 長さはどの行も同じ尺度で `v` に比例。わからない区切りにも `v` を書く
- `unknown`：`"□"` か `"?"`（`label` は後ろに続く）
- brace：`{row, from, to, label, side: "above" | "below"}`。from・to は 0 から数えた区切りの番号
- times：`{from, to, label: "2 倍"}`（行の番号）
- `kind="line"`：線分図
- 項目の `show`：出すステップ
- 行の名前に色の名前（赤・白）を使わない。色はテーマで変わる
