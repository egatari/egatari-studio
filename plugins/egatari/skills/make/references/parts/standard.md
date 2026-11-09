<!-- generated; do not edit by hand -->
# standard のパーツ

指示の版：7855d763

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-bars>` | 棒をステップごとに 0 から伸ばす（縦棒・横棒・組の棒・積み上げ棒）。値の軸の上限をステップで広げて「軸を突き抜ける伸び」も見せられる | 組の step と scale の step の最大（既定は組 1 つ = 1 ステップ。per-step で n 組ずつ） | `{groups:[{label?,value?:num,values?:num[],step?,at?,tone?} (value or values),…],series?:{label?,tone?}[],scale?:{step,max?:num,at?}[],max?:num}` |
| `<m-cards>` | カード（番号の丸・アイコン・見出し・説明）を横一列か 2 段に並べ、ステップごとに出す。矢印で順を、枠の色で強調を見せる | カードの step の最大（既定はカード 1 枚 = 1 ステップ。per-step で n 枚ずつ） | `{cards:{n?:str,icon?:str,title:str,text?:str,step?,tone?}[]}` |
| `<m-compare>` | 2 つ（3 つまで）を横に並べて比べる表。一方の列、もう一方の列、それから行ごとの違い | 列の数 + 1（違いのステップ。diff も better もなければ列の数だけ） | `{sides:{label,tone?,step?}[],rows:{label?,values:(str\|num)[],diff?:str,better?:int}[]}` |
| `<m-curves>` | 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く） | step の最大（既定は系列の数） | `[{label?,f?:str,pts?:[num,num][],tone?,step?,labelAt?:num,color?:str,dash?:bool,xr?:[num,num],at?,anchor?:"right"\|"left"\|"above"\|"below"\|"top"\|"bottom"\|"start"\|"middle"\|"end",dx?:num,dy?:num,ly?:num} (f or pts),…]` — データは配列そのもの（{"series": […]} ではない）。軸は属性に書く（xr="[0,10]" xl="…"）。式の欄は f で、変数は x（fn・u ではない） |
| `<m-cycle>` | 循環の図。ステップの箱を円の上に 12 時から時計回りに並べ、円に沿った矢印でつなぐ（最後から最初へ戻る矢印も） | ステップの数（既定は 1 つ = 1 ステップ。per-step で n 個ずつ、`node` の step が優先） | `{nodes:{id?:str\|int,label?,tex?,note?,tone?,step?,at?}[],center?:{label?,tex?,note?,tone?,step?,at?},edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` |
| `<m-fishbone>` | 原因と結果の図（特性要因図・フィッシュボーン図）を、大骨 1 本ずつ組み立て、最後に結果（頭）を出す。座標は書かず、配置はパーツが決める | 大骨の数 + 1（頭）。節と edges の step があればその最大 | `{effect:{label?,tex?,note?,tone?,step?,at?},nodes:{id:str\|int,label?,tex?,note?,tone?,parent?:str\|int,step?,at?}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` — parent のない節が大骨（分類）、その子が原因、孫が細かい原因（3 段まで） |
| `<m-flow>` | 流れ図の箱と矢印をステップごとに出して、図を組み立てる | nodes と edges の step の最大 | `{nodes:{id:str\|int,label?,tex?,x:num,y:num,w:num,h:num,step?,tone?,at?,shape?:str}[],edges?:{from:str\|int,to:str\|int,step?,label?,tone?,dash?:bool,kind?:"money"\|"service"\|"data",amount?:str\|num,shift?:num,pulse?:bool\|any[],pulseAt?:num,offset?:num,at?,loop?:bool\|str}[]}` |
| `<m-kpi>` | 大きな数字の札（KPI）をステップごとに出す。数字は数え上げ、下に増減の矢印と一言 | 札の step の最大（既定は札 1 枚 = 1 ステップ。per-step で n 枚ずつ） | `{cards:{label?,value:num,digits?:int,unit?:str,prefix?:str,from?:num,tone?,delta?:{dir?:"up"\|"down",text?:str,good?:bool},note?,step?,at?}[]}` |
| `<m-menu>` | スライドへのリンクの札を格子に並べる（目次・単元の選び方）。札はふつうの <a href="#<スライドの id>">、行ったスライドの札に「見た」の印 | ceil(札の数 / per-step)（既定の per-step="0" なら 0：初めから全部） | 子の `<a href>`（JSON ではない） |
| `<m-pie>` | 円グラフとドーナツグラフ。切れの名前と値・割合は、大きい切れなら中に、小さい切れなら外に引き出し線で書く | 既定は 1（全部を一度に）。per-step で n 切れずつ、切れの step で直接 | `{slices:{label?,value:num,tone?,step?,place?:"auto"\|"in"\|"out"}[],center?:str}` — 切れは "slices" に書く（"data" や "groups" ではない）。value は数（"26%" のような字ではない）。12 時の位置から時計回りに、書いた順に並ぶ |
| `<m-predict>` | 予想してから答えを開く。選択肢ごとの人数を棒で見せ、答えのステップで正解に枠 | 0 問いと選択肢、1 人数の棒、answer-step（既定 2）で答え | `{question?:str,choices:{label,tone?}[],answer:int,counts?:int[],note?}` — choices は {"label": …} の並び（字の並びではない）。answer は正しい選択肢の番号（0 から数える）。counts（省略可）は選択肢ごとに 0 以上の整数を 1 つずつ |
| `<m-quad>` | 2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）に、点をステップごとに 1 つずつ置く | 点の step と to.step の最大（既定は点 1 つ = 1 ステップ） | `{x?:{lo?:str,hi?:str},y?:{lo?:str,hi?:str},quads?:{tr?:str,tl?:str,bl?:str,br?:str,fill?:str},items:{label?,x:num,y:num,step?,at?,tone?,anchor?:"right"\|"left"\|"above"\|"below",r?:num,self?:bool,to?:{x:num,y:num,label?,step?,at?}}[]}` |
| `<m-scatter>` | 散布図。点の組（系列）をステップごとに出し、そのあと傾向の線（最小二乗の直線か、書いた 2 点）を引く | 系列の数 ＋ 傾向の線（既定は系列 1 つ = 1 ステップ、そのあと線をまとめて 1 ステップ。系列・線の step で直接） | `{series:{label?,tone?,step?,at?,points:([num,num]\|{x:num,y:num,label?,anchor?:"right"\|"left"\|"above"\|"below"\|"top"\|"bottom",tone?})[]}[],trend?:str\|{fit?:"linear",pts?:[[num,num],[num,num]],series?:int\|any[],label?,tone?,dash?:bool,step?,at?,digits?:int}\|[the same {…},…]}` — 点は [x, y] か {"x", "y", "label"}。軸は属性に書く（xr="[0,10]" xl="…"）。trend は "linear" か {"fit": "linear", "label": "…"} か {"pts": [[x0, y0], [x1, y1]]} |
| `<m-timeline>` | 年表。出来事を時間の軸の上に 1 つずつ出す。期間は帯にして、重なる期間は段を分けて積む。end は含まない（"1912" は 1912 年の初め） | 出来事の数（既定は時刻の順に 1 つ = 1 ステップ。per-step で n 個ずつ、`node` の step が優先） | `{nodes:{id?:str\|int,label?,tex?,note?,tone?,when:num\|str,whenLabel?:str,end?:num\|str,lane?:str,step?,at?,after?:(str\|int)[],progress?:num}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` — when / end: a number or "YYYY", "YYYY-MM", "YYYY-MM-DD"; end is exclusive ("1912" is the start of 1912). whenLabel: the date text shown instead of the computed one (when still sets the position). A `node` with end is a period (a band); lane groups bands into named lanes |
| `<m-tree>` | 階層・分類の木（組織図、生物の分類など）を、根から 1 段ずつ組み立てる。座標は書かず、配置はパーツが決める | 節の深さの数（by="level"、既定）か節の数（by="node"）。節と edges の step があればその最大 | `{nodes:{id:str\|int,label?,tex?,note?,tone?,parent?:str\|int,branch?:str,step?,at?}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[],path?:(str\|int)[],pathStep?:int,pathNote?:str}` — parent のない節（根）はちょうど 1 つ |
| `<m-venn>` | 2 つか 3 つの集合の円（ベン図）。集合を 1 つずつ出し、最後に重なりを強めてその中の項目を出す | 集合の数 + 1（overlaps="each" なら 集合の数 + 項目のある重なりの数。項目のある重なりがなければ重なりすべての数：2 集合で 1、3 集合で 4） | `{sets:{label,tone?}[],regions?:{A?:str[]\|str,B?:str[]\|str,C?:str[]\|str,AB?:str[]\|str,AC?:str[]\|str,BC?:str[]\|str,ABC?:str[]\|str}}` |

### `<m-bars>`

データ（子の `<script type="application/json">`）の見本: `{"series":[{"label":"売上"}],"groups":[{"label":"1 年目","value":1.2},{"label":"2 年目","value":3.4}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `orient` | string | `"v"` | v（縦棒）か h（横棒。順位や比較に） |
| `max` | number | `0` | 値の軸の上限（0 = 自動。scale があれば最初の上限） |
| `unit` | string | `""` | 値の単位（数字の後ろに付ける。億円、%、社 など） |
| `digits` | number | `0` | 値の小数桁 |
| `per-step` | number | `1` | 1 ステップに出す組の数（0 = 全部をステップ 1 で） |
| `count` | bool | `false` | 値の数字を伸びに合わせて数え上げる |
| `ticks` | bool | `true` | 値の軸の目盛りと格子 |
| `al` | string | `""` | 値の軸の名前 |
| `stack` | bool | `false` | 組の値を 1 本に積み上げる（積み上げ棒）。\ |

年ごとの売上・費用、聞き取りの結果の順位、導入の前と後の比較など、量を 1 つずつ見せて比べるときに使う。

- group：`label`（`\n` で 2 行）、`value`（系列が 1 つ）か `values`（系列の数だけ）、`step`（既定は per-step から）、`at`（ステップの中の開始秒。既定は同じステップの中で stagger ずつずらす）、`tone`（`emph` などテーマの変数の名前。その組の棒をすべてその色にし、値の数字も同じ色にする）
- series：`label`（系列が 2 つ以上のとき、最初の組の棒に直接書く。縦棒は棒の上、横棒は値の数字の右（負の棒は下・左）。凡例は作らない）、`tone`（既定は `--series-1..4` の順。系列が 1 つなら `--term`）
- scale：`[{"step": 3, "max": 27, "at": 0.4}]`。そのステップの at 秒から zoom 秒かけて、値の軸の上限を max へ動かす（対数で補間）。動く間は前の上限までの範囲を薄い帯で残し、目盛りは前の組と次の組を入れ替える。上限を超える棒は軸の上端で止まり、上限が広がるにつれて伸びる
- 横棒（`orient="h"`）は組の名前を左に、値を棒の右に書く。順位を見せるなら `ticks="false"` で目盛りを消してよい
- 積み上げ棒（`stack="true"`、`"percent"` なら各組 100 %）：組の `values` を横に並べず 1 本に積み上げる（全体と内訳を組ごとに見せるとき）。合計を棒の端に、それぞれの値を区切りの中に書く。軸の上限は合計から決まる。組の `tone` は合計の数字の色。値は 0 以上にする（負の値は 0 として描く）

注意

- 値の数字は既定で棒が伸びきってから出す。伸びる途中の値は読めてしまうと「データ」に見えるため。数え上げたいときだけ `count="true"`。積み上げ棒で `count="true"` にすると数え上げるのは端の合計だけで、区切りの値と系列の名前は伸びきってから出る（ステップの長さはその分 0.35 秒長い）
- 系列の名前は最初の組の棒に書くので、組の棒が細いと隣の系列の名前と重なる。系列は 2〜3 つまでにする

### `<m-cards>`

データ（子の `<script type="application/json">`）の見本: `{"cards":[{"icon":"user","title":"聞く","text":"相手の困りごとを聞く"},{"icon":"bulb","title":"考える","text":"案を 3 つ出す"},{"icon":"rocket","title":"試す","text":"小さく作って見せる"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `layout` | enum | `"row"` | row：横一列。grid：2 段（4 枚までは 2×2、5〜6 枚は 3×2） |
| `arrows` | bool | `false` | カードの間に順の矢印（grid では 1→2→3→4 の Z の順） |
| `nums` | bool | `false` | 番号の丸を出す（カードの n が優先。n だけ書いたカードはそれを出す） |
| `hilite` | string | `""` | 強調するカード：last か番号（1 から）。--emph の枠と地 |
| `per-step` | number | `1` | 1 ステップに出すカードの数（0 = 全部をステップ 1 で） |

同じ重さの短い要点が 3〜4 個なら、箇条書きよりカード（アイコン付き）を検討する。事例の 2×2 にも。短い手順は arrows で順を示す。長い文や重さの違う項目は箇条書きのまま。

子の JSON の並び：2〜6 枚。

- `title`：見出し（必須。2 行まで）。`text`：説明（入るだけ折り返す。入らなければ … で切って知らせる）
- `icon`：アイコンの名前（Tabler Icons の線の形。下の一覧から。ほかの名前も使えるが、ない名前は点線の四角になって知らせる）
- `n`：番号の丸に出す字（`"A"` `"1"` など）。`nums` を付けると n のないカードに 1, 2, 3 … を出す
- `tone`：番号の丸とアイコンの色（`term`（既定）・`emph`・`accent2`・`series-1..4`）
- `layout="grid"`：2 段（4 枚までは 2×2、5〜6 枚は 3×2）。横に広いカードは 番号・アイコン・見出しを 1 行に並べる
- `arrows`：カードの間に順の矢印（grid では 1→2→3→4 の Z の順）。`hilite="last"` か `hilite="3"`：そのカードを `--emph` の枠と地で強調
- 見せ方（`variant`）：`rise`・`fade`・`draw`。書かなければ資料のシード値で選ばれる（書かなくてよい）

アイコンの名前（よく使うもの）：

- 人：user users user-check user-plus user-circle friends mood-smile man woman id-badge
- データ：chart-bar chart-line chart-pie chart-dots trending-up trending-down table database filter adjustments percentage sum
- お金：coin cash credit-card wallet receipt pig-money building-bank report-money shopping-cart tag
- 時間：clock calendar calendar-event calendar-time hourglass history alarm stopwatch
- 場所：map-pin map world home building building-factory building-store route truck
- 進め方：arrow-right arrows-right-left refresh repeat circle-check checklist list-numbers git-branch target flag rocket hand-click
- 伝える：message messages mail phone bell speakerphone share world-www microphone presentation
- 書類：file file-text files notebook book clipboard-list folder news certificate award
- 道具：tool settings hammer bulb puzzle cpu device-laptop device-mobile robot code scale
- 自然：leaf tree plant sun moon cloud cloud-rain droplet flame snowflake
- 安全：shield shield-check lock key alert-triangle first-aid-kit heart heart-rate-monitor eye
- 学び：school pencil ruler math-function atom flask microscope palette music language

### `<m-compare>`

データ（子の `<script type="application/json">`）の見本: `{"sides":[{"label":"紙の申請","tone":"muted"},{"label":"オンライン申請"}],"rows":[{"label":"受付時間","values":["平日 9〜17 時","24 時間"],"better":1,"diff":"いつでも出せる"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `28` | 値の字の大きさ（px）。収まらなければ 24 まで縮める |
| `diff-label` | string | `""` | 違いの列の見出し（空なら「違い」） |

従来の方法と新しい方法、A 案と B 案、植物の細胞と動物の細胞のように、2 つ（3 つまで）のものを同じ観点で並べて比べるときに使う。
量を棒の長さで比べるなら `m-bars`、数字を 1 つ大きく見せるなら `m-kpi`。

- `sides`：比べるもの（2 つか 3 つ）。`label` は列の見出し。`tone` は列の色（`term`・`emph`・`muted`・`accent2`・`series-1..4`。既定は 1 つ目 `term`、2 つ目 `accent2`、3 つ目 `series-4`）。従来のものを `muted` にすると新しいものが目立つ
- `rows`：比べる観点（行）。`label` は左端の観点の名前（なくてもよい）、`values` は列の順の値（字か数。`\n` で改行。長ければ列の幅で折り返す）。`values` の数は `sides` の数と同じにする（違えば図の代わりに誤りの札が出る）
- `diff`：その行の違いの一言。右端の「違い」の列に `--emph` で書く（列の見出しは `diff-label` で変えられる）
- `better`：その行で良い方の列の番号（0 から。1 つ目の列が 0。列の数より小さい）。値を太字にし、違いのステップで `--emph` の枠で囲む
- ステップ：既定は 1 つ目の列（観点の名前と一緒に）→ 2 つ目の列 →（3 つ目の列）→ 違い（`diff` の列と `better` の枠）。列の `step` でステップを変えられる（例：2 つの列を同じステップに）
- 見せ方（`variant`）：`fade`・`slide`・`reveal`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 字は `size`（既定 28 px）から 24 px まで縮めて要素の箱に収める。表は上にそろえ、余った高さは行に少し分ける

### `<m-curves>`

データ（子の `<script type="application/json">`）の見本: `[{"label":"需要 D","f":"10 - x"},{"label":"供給 S","f":"2 + x"},{"label":"均衡","pts":[[4,0],[4,6]],"dash":true}]`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `xr` | json | `[0, 1]` | 横軸の範囲 |
| `yr` | json | `[0, 1]` | 縦軸の範囲 |
| `xt` | json | `[]` | 横軸の目盛りの値 * |
| `yt` | json | `[]` | 縦軸の目盛りの値 * |
| `xf` | number |  | 横軸の目盛りの小数桁 |
| `yf` | number |  | 縦軸の目盛りの小数桁 |
| `xl` | string | `""` | 横軸の名前（`*斜体*` `_下付き` `^上付き`） * |
| `yl` | string | `""` | 縦軸の名前 * |
| `n` | number | `300` | f を描く分割数 |
| `lw` | number | `3.5` | 線の太さ |
| `size` | number | `0` | 字の大きさ（24 以上。0 = 既定） |

同じ予測分布に平均・中央値・分位点を順に引く、損失関数を 1 つずつ重ねる、など
「一つの図で比較の軸を一つずつ見せる」ときに使う。

系列は子の `<script type="application/json">` に配列で書く。
1 系列 = 1 ステップ（書いた順）。`step` で変えられ、同じ `step` の系列は一緒に引く。台本の [n] はこのステップに合わせる。

| 欄 | 意味 |
|---|---|
| `label` | 線の名前 |
| `f` | x の算術の式（`exp(…)` `sqrt(…)` `PI` などの `Math` の関数と定数、`N(x, 平均, 標準偏差)`、`+ - * / % **`、比較と `? :`。下を見よ）。`xr` で描く範囲を狭められる |
| `pts` | 点列 `[[x, y], …]`（縦線や実測の折れ線） |
| `tone` | `term` `emph` `accent2` `muted` `fg` `series-1..4`（既定は `series-1..4` の順） |
| `dash` | 破線 |
| `labelAt` / `anchor` / `dx` / `dy` / `ly` | 名前の位置：横軸の値 `labelAt` の点に置く（既定は線の端）。`anchor` は向き（`right` `left` `above` `below`）。`ly` は縦軸の値で高さを決める |

`size="40"`：字の大きさ（24 以上）。

`f` は算術の式で、コードとしては実行しない：数、`x`、`Math` の関数と定数（`sin(x)` とも `Math.sin(x)` とも書ける。`Math.random` は使えない）、`N(x, 平均, 標準偏差)`、`+ - * / % **`、比較（`< <= > >= == !=`）、`&& || !`、`? :`、括弧。べき乗は `**`（`^` は書けない）。書けない式は図の代わりに札が出る。

### `<m-cycle>`

データ（子の `<script type="application/json">`）の見本: `{"center":{"label":"PDCA"},"nodes":[{"label":"計画"},{"label":"実行"},{"label":"評価"},{"label":"改善"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `per-step` | number | `1` | 1 ステップに出すステップ（箱）の数（0 = 全部をステップ 1 で） |
| `size` | number | `26` | 箱の字の大きさ（px。入らなければ 24 まで縮める） |

PDCA、水の循環、細胞周期、学習のサイクルなど、同じ順で回り続けるステップを見せるときに使う。
座標は書かない。ステップの中身を配列の順に書けば、パーツが並べる（共通の決まり §2）。

子の JSON の並び：`center` と `edges` は省ける。

- `nodes`：ステップ（3〜8 個を想定）。配列の順に回る。12 時の位置から時計回りに置き、となりのステップへ円に沿った矢印を引く。最後から最初へ戻る矢印は自動で引く
  - `label`（`\n` で改行）か `tex`（KaTeX）、`note`（箱の中の 2 行目に小さく、`--muted`）、`tone`（`term`（既定）・`emph`・`muted`・`accent2`・`series-1..4`）、`step`、`at`、`id`
- `center`：真ん中の名前（`{"label": "PDCA", "note": "…"}`）。最初のステップと一緒に出る（`center.step` で変えられる）。`center` はオブジェクト。`m-pie` の `center` は字（文字列）なので取り違えない
  - `label`（`\n` で改行）か `tex`（KaTeX）、`note`（箱の**中**の最後の行に小さく、`--muted`）、`tone`（`term`（既定）・`emph`・`muted`・`accent2`・`series-1..4`）、`step`、`at`
  - `tone: emph` の箱は、地が `--emph-tint`、枠と字が `--emph`
- `edges`：ほかのつながり（`from` `to` はステップの `id`、`label` `tone` `dash` `step`）。箱の縁から縁への破線の矢印
- 矢印の色は `--muted`、3 px（`edges` も `tone` がなければ `--muted`）

並べ方：

- 横に長い場所では円を横に伸ばした楕円にする（縦の 1.9 倍まで。縦に長くはしない）。箱と矢印が要素の箱に入る大きさにする
- ステップ：既定は 1 ステップに 1 つ。入ってくる矢印はそのステップの箱と一緒に出る。最後から最初へ戻る矢印は、最後のステップの箱が出たあとに引く
- 見せ方（`variant`）：`fade`・`draw`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 動きの上限：どの見せ方でも箱が動くのは 12 px まで（箱の中心で測る。大きさは 0.92 倍から、`fade` と同じ）、時間も `fade` の長さの中（共通の決まり §1.2）
- 授業の表示（`ctx.preview`）：後のステップの箱と矢印をテーマの薄さで見せる
- `cues(k)`：同じステップに 2 つ以上の箱があれば、2 つ目からの開始時刻を返す

### `<m-fishbone>`

データ（子の `<script type="application/json">`）の見本: `{"effect":{"label":"配送の遅れ"},"nodes":[{"id":"p","label":"人"},{"id":"p1","label":"人手が足りない","parent":"p"},{"id":"m","label":"機械"},{"id":"m1","label":"車の故障","parent":"m"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `order` | string | `"causes-first"` | ステップの順：causes-first（大骨 1 本ずつ、最後に頭、既定）か effect-first（頭と背骨が先） |
| `size` | number | `0` | 箱の字の大きさ（px。0 = 27 から入るまで 24 まで縮める） |

品質管理の 4M（人・機械・方法・材料）で不良や遅れの原因を洗い出すとき、理科で「なぜうまくいかないのか」を分けて考えるときなど、
1 つの結果に効く原因を分類して見せるときに使う。座標は書かない（共通の決まり §2）。

子の JSON の並び：`edges` は省いてよい。

- effect：結果（頭）。`label`（`\n` で改行）か `tex`、`note`（箱の下の一言）、`tone`（既定 `emph`）、`step`、`at`
- node：`id`、`label`（または `tex`）、`note`、`parent`、`tone`、`step`、`at`。`parent` のない節が大骨（分類）、その子が原因、孫が細かい原因（3 段まで）
  - 大骨は配列の順に、左から、上・下・上・下と交互に付く。分類の名前は大骨の外の端の箱に書く（`note` は箱の**外側**に小さく）
  - 原因と細かい原因の `tex` は式（KaTeX）として線の上に、`note` は名前の後ろに続けて小さく（`--muted`）書く
  - 原因は大骨に付く横の線の上に、細かい原因は原因の線から大骨と平行に下ろした線に付く横の線の上に書く
  - `tone`：大骨なら箱と骨の色、原因なら字と線の色（`emph` は太字）。`emph` の箱は地が `--emph-tint`、枠と字が `--emph`
  - 線の色は `--muted`。背骨は 5 px（図の中心の線）、大骨は 3.5 px、原因の線は 2.5 px
- edge：原因どうしのほかのつながり（`from` `to` `label` `tone` `dash` `step`）。破線で矢印つき、字の左へふくらむ。同じ大骨の原因どうしに向く
- `order`：`causes-first`（既定。大骨 1 本ずつ（その原因と一緒に）、最後に頭）か `effect-first`（頭と背骨を先に出し、それから大骨 1 本ずつ）。節の `step` が勝つ（原因だけ後のステップにもできる）
- 見せ方（`variant`）：`fade`・`draw`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 動きの上限：どの見せ方でも箱と字が動くのは 12 px まで（箱の中心で測る）、時間も `fade` の長さの中（共通の決まり §1.2）
- 入る大きさの目安（1280×720 の本文、高さ 440 px ほど）：大骨 1 本あたりの行（原因と細かい原因の数）は 3 つまで（短ければ 4 つ）、大骨は 4〜6 本、原因は 10 字ほどまで。字は 24 px より小さくならず、入らない分は要素の箱から上下・左右にはみ出す（足りない px を `ctx.report` で知らせ、Studio の検査に出る）。多いときは図を分けるか、原因を短く言い換える
- 授業の表示（`ctx.preview`）では、後のステップの骨と字をテーマの薄さで出しておく

### `<m-flow>`

データ（子の `<script type="application/json">`）の見本: `{"nodes":[{"id":"a","label":"観測","x":20,"y":40,"w":200,"h":70,"step":1},{"id":"b","label":"更新","x":320,"y":40,"w":200,"h":70,"step":2}],"edges":[{"from":"a","to":"b","step":2}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `26` | 箱の字の大きさ（px） |
| `pulse-n` | number | `3` | pulse で流れる点の数 |
| `label-gap` | number | `12` | 辺の名前・金額と箱との最小の間（px）。近ければ線から離す |

証明や手法の各ステップに合わせて箱と矢印を出し、文と図の対応を見せるときに使う。

座標は要素の箱の px（`x`, `y` は箱の左上、`w`, `h` は大きさ）。

- node：`id` `label`（`\n` で改行）または `tex`（KaTeX）、`step`、`tone`（`term` / `emph` / `muted`）、`at`（ステップの中の開始秒）、`shape:"diamond"`（判断）
- edge：`from` `to` `step`（既定は両端の箱の遅いほう）、`label`、`tone`、`dash`、`offset`（名前と線の距離）、`at`、`loop`（前の箱へ外側を回って戻る辺。回る側は `"left"` `"right"` `"top"` `"bottom"`、`true` なら両端が縦に並ぶとき右・横に並ぶとき下）
- 色：線と線の名前は `--fg`（`tone` があればその色）。`muted` の箱は枠が `--muted`、地が `--bg`、字は `--fg`
- 箱は薄く拡大しながら現れ、矢印は同じステップの箱が出てから引く

### `<m-kpi>`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `cols` | number | `0` | 1 行の札の数（0 = 札の数、4 まで） |
| `digits` | number | `0` | 数字の小数桁（札の digits が優先） |
| `per-step` | number | `1` | 1 ステップに出す札の数（0 = 全部をステップ 1 で） |
| `count` | bool | `true` | 数字を数え上げる |
| `size` | number | `0` | 数字の字の大きさ（px。0 = 札の高さから） |

表紙の直後の「掴みの数字」、試験導入の結果、市場規模の要約など、少数の数字を大きく見せるときに使う。

- `label`：札の上の名前。`value`：数字（`digits` 桁、3 桁ごとにカンマ）。`unit`：数字の後ろの単位（小さめの字）。`prefix`：数字の前の記号（`+` `約` など）。負の `value` は自分で − が付くので、`prefix` に `−` を重ねない（`"prefix": "−"` と `-12` は「−−12」）。減った量を正の数で見せるときだけ `value` を正にして `prefix: "−"`
- `from`：数え上げを始める値（既定 0。「20 分 → 7.5 分」のように減らす数も見せられる）
- `tone`：数字と札の上の帯の色（`term`（既定）・`emph`・`accent2`・`series-1..4`）
- `delta`：`{"dir": "up" | "down", "text": "前の期から 4 社", "good": true}`。▲ / ▼ と一言を数字の下に出す。良い向き（`good`、既定は `up` なら良い）なら `--term`、悪い向きなら `--emph`
- `note`：札の下端の一言（`--muted`）
- 見せ方（`variant`）：`count`・`rise`・`flip`・`underline`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 札の並び：`cols`（既定は札の数、4 まで）列で、行が足りなければ折り返す
- `cues(k)`：同じステップに 2 枚以上の札があれば、2 枚目からの開始時刻を返す（台本の `{cue}` に合わせられる）

### `<m-menu>`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `cols` | number | `0` | 列の数（0 なら札の数から：3 枚までは 1 行、4 枚は 2 列、それより多ければ 3 列） |
| `per-step` | number | `0` | 1 ステップに出す札の数（0 なら初めから全部出し、ステップを使わない） |
| `size` | number | `34` | 札の題の字の大きさ（px）。副題はその 0.8 倍（本文の下限の 27px より小さくしない） |
| `visited` | bool | `true` | このセッションで行き先のスライドを開いた札に「見た」の印を付ける |

目次、授業の単元の選び方、「どこから見るか」を選ばせる 1 枚に使う。目次は取り込んだ後に足す。初稿では普通の箇条書き。
```html
<m-menu cols="3" aria-label="今日の内容">
  <a href="#s-njd4kp" data-icon="一" data-sub="孟浩然">春暁</a>
  <a href="#s-uhqygr:2" data-icon="二" data-sub="読む順から">春望</a>
</m-menu>
```

- 子の `<a href>` 1 つが札 1 枚。`href` は `#<スライドの id>`（そのステップ 0）か `#<id>:<ステップの鍵>`（`0`・`1`・… か `concl`）。id は取り込みのときに付く。中身（文字・`<b>` など）が札の題になる
- `data-icon`：題の左の丸に入れる短い字（`一`・`1`・`A` など。色は `--term`）。`data-sub`：題の下の副題（`--muted`）
- ステップ：`per-step="n"` なら札が n 枚ずつステップごとに出る（`data-from` から。同じステップの中は `stagger` 秒ずつずれる）。まだ出ていない札は押せず、Tab でも選べず、読み上げない。
  `per-step="0"`（既定）なら初めから全部（ステップを使わない）。ステップは (k, t) だけで決まる
- 並び：`cols`（既定は札の数から：3 枚までは 1 行、4 枚は 2 列、それより多ければ 3 列）。札の高さの下限は CSS の `--mm-h`（既定 104px）、間は `--mm-gap`（18px）。
  本文いっぱいに置いて縦の真ん中にそろえるなら `style="height:100%;align-content:center;--mm-h:150px"`

### `<m-pie>`

データ（子の `<script type="application/json">`）の見本: `{"slices":[{"label":"食費","value":7.2},{"label":"住まい","value":8.5},{"label":"その他","value":2.1,"tone":"muted"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `donut` | number | `0` | ドーナツの内側の半径の割合（0 = 円グラフ。0.5〜0.6 がよい） |
| `unit` | string | `""` | 値の単位（数字の後ろに付ける。万円、人、% など） |
| `digits` | number | `0` | 値の小数桁 |
| `pct-digits` | number | `0` | 割合の小数桁 |
| `show` | string | `"pct"` | 名前の下に書くもの：pct（割合）・value（値）・both（値と割合）・none |
| `per-step` | number | `0` | 1 ステップに出す切れの数（0 = 全部をステップ 1 で） |

家計や予算の内訳、回答の割合など、全体を 100% としたときの内訳を見せるときに使う。
内訳は一度に全部見せる（共通の決まり §3）。量どうしを細かく比べたいなら `m-bars` のほうが読みやすい。

- slice：`label`（名前）、`value`（数。割合はこの値から計算する）、`tone`（`term` `emph` `accent2` `muted` `fg` `series-1..4`）、`step`、`place`（`auto`（既定）・`in`・`out`）
  - 切れは 12 時の位置から時計回りに、書いた順に並ぶ。「その他」は最後に書き、`"tone": "muted"` にするとよい
  - 既定の色は `--series-1..3`、4〜6 切れ目は同じ 3 色を薄くしたもの、7 切れ目は `--series-4`。切れは 6〜7 つまでにする
- `center`：ドーナツの穴の中の字（`\n` で改行。`{total}` は合計の値に置き換わる。例：`"回答\n{total}"`）。`center` は字（文字列）。`m-cycle` の `center` は `{"label": …}` のオブジェクトなので取り違えない
- `donut`：ドーナツにする（内側の半径の割合。`0.5`〜`0.6` がよい。0 なら円グラフ）
- `show`：名前の下に書くもの：`pct`（割合、既定）・`value`（値）・`both`（値と割合）・`none`
- `unit` `digits`：値の単位と小数桁（3 桁ごとにカンマ）。`pct-digits`：割合の小数桁（既定 0）。割合は足して 100% になるように丸める
- ステップ：既定は全部をステップ 1 で出す。`per-step="1"` で 1 切れずつ（台本が 1 切れずつ話すときだけにする。そのときは全体の輪郭を初めから薄く見せる）。切れの `step` を書けばそれが勝つ
- 字の置き場所：切れの中に収まれば中に（濃い切れでは背景の色の字）、収まらなければ外の左右の列に引き出し線で書く。外の字が縦に重ならないように並べ直し、字が片側だけなら字と円をまとめて真ん中に寄せる
- 見せ方（`variant`）：`fade`・`sweep`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 授業の表示（`ctx.preview`）では、先のステップの切れをテーマの薄さで見せる

### `<m-predict>`

データ（子の `<script type="application/json">`）の見本: `{"question":"重い球と軽い球、どちらが先に落ちる？","choices":[{"label":"重い球"},{"label":"軽い球"},{"label":"同時"}],"answer":2,"counts":[14,3,9],"note":"空気の抵抗を除けば同時に落ちる"}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `answer-step` | number | `2` | 答えを開くステップ（1 以上。1 なら数の棒と同時） |
| `unit` | string | `""` | 数の単位（人 など） |
| `poll` | string | `""` | 投票の id（今は見る人・作者の数を使う） |
| `ticks` | bool | `true` | 数の軸の目盛りと格子 |

「A だと思う人〜」と手を挙げてもらい、先生が −1・＋1 で数える（数を打ち込んでもよい）。一人で自習する学習者は、選択肢を押すと自分の予想になる。

- 選択肢は 2〜6。動画・印刷・最初の表示は `counts`（無ければ 0）。同じスライドにいるあいだは数が残る（答えのステップでも、戻っても）
- 台本は `counts` の数で書き、数える所は `{note:ここで手を挙げてもらう}` と書く（丸かっこは読み上げられる）
- `poll="p1"`：v0.6.3 は結果公開の送信元がなく、`ctx.live.poll(id)` は null。見る人・作者の数を使う

### `<m-quad>`

データ（子の `<script type="application/json">`）の見本: `{"x":{"lo":"手作業","hi":"自動"},"y":{"lo":"高い","hi":"安い"},"items":[{"label":"A 社","x":0.25,"y":0.7},{"label":"自社","x":0.8,"y":0.82,"self":true}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `26` | 点の名前の字の大きさ（px） |
| `quads-step` | number | `0` | 象限の名前を出すステップ（0 = 初めから） |

競合と自社の位置づけ、施策の分類（効果×手間）、SWOT のように、2 つの軸の上に項目を 1 つずつ置いて
「空いている場所」を見せるときに使う。

- `x` `y`：軸の両端の言葉（横軸は軸の下の両端、縦軸は軸の上端と下端の外）。軸と言葉はステップ 0 から見える
- `quads`：象限の名前（tr = 右上、tl = 左上、bl = 左下、br = 右下）。`fill` に象限の名前（`"tr"` など）を書くとその象限を淡く塗り、名前を `--term` で書く。名前は `quads-step` のステップで現れる（既定 0 = 初めから）
- item：`label`、`x` `y`（0〜1。0.5 が軸の交わるところ）、`step`（既定は前の点の次のステップ）、`at`（ステップの中の開始秒）、`tone`（`term` / `fg`、既定は `--muted`）、`anchor`（名前の位置：`right`（既定）・`left`・`above`・`below`）、`r`（丸の半径）
- `self: true` の点は `--emph` で大きく描き、現れたときに輪が 1 回広がる（最終状態では輪は出ない）
- `to: {"x", "y", "label", "step", "at"}`：移動先。`to.step`（既定は点の次のステップ）に、点が破線の跡を引きながら滑り、着いたら移動先の上に `label` を出す
- `cues(k)`：同じステップに 2 つ以上の点があれば、2 つ目からの開始時刻（at）を返す。台本の `{cue}` の数と合えば、点が言葉に合わせて現れる

注意

- 象限の名前は、点・点の名前・軸の言葉にかからない隅に置く。どの隅もかかるときは点の名前を置き直す（置き場がなければ `ctx.report` で知らせる）
- 点の名前どうし・移動先の名前との重なりは置き直さない。近い点の名前は重なることがあるので、`anchor` を変えるか座標をずらす

### `<m-scatter>`

データ（子の `<script type="application/json">`）の見本: `{"series":[{"label":"晴れ","points":[[24,210],[28,380],[31,560],{"x":34,"y":690,"label":"猛暑日"}]}],"trend":"linear"}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `xr` | json | `null` | 横軸の範囲（書かなければデータから） |
| `yr` | json | `null` | 縦軸の範囲（書かなければデータから） |
| `xt` | json | `null` | 横軸の目盛り（書かなければ自動） |
| `yt` | json | `null` | 縦軸の目盛り（書かなければ自動） |
| `xf` | number |  | 横軸の目盛りの小数桁 |
| `yf` | number |  | 縦軸の目盛りの小数桁 |
| `xl` | string | `""` | 横軸の名前（`*斜体*` `_下付き` `^上付き`） * |
| `yl` | string | `""` | 縦軸の名前 * |
| `r` | number | `9` | 点の半径（px） |

気温と売上、勉強時間と点数、価格と販売数など、2 つの量の関係を見せるときに使う。
点を出してから傾向の線を引く（共通の決まり §3 の「点、それから傾向」）。

- series：`points`（点の並び。`[x, y]` か `{"x", "y", "label", "anchor", "tone"}`）、`label`（系列の名前。図の上に印と一緒に書く）、`tone`（`term` `emph` `accent2` `muted` `fg` `series-1..4`。既定は `series-1..4` の順）、`step`（1 系列 = 1 ステップ（書いた順）。同じ `step` の系列は一緒に出す）、`at`（ステップの中の開始秒）
  - 点の `label` は点の横に書く（右 → 左 → 上 → 下の順に、ほかの点・字・軸と重ならない所。`anchor`（`right` `left` `above` `below`）で最初に試す向きを決められる）。外れた点や目立つ点だけに付ける
  - 系列ごとに印の形が変わる（丸・四角・三角・ひし形）。色だけに頼らない。形と既定の色は 4 系列までで、5 つ目からは同じ組がくり返すので、系列は 4 つまでにする
- trend：`"linear"`（全部の点の最小二乗の直線）、または `{"fit": "linear", "series": 0, "label", "tone", "dash", "step", "at", "digits"}`、または `{"pts": [[x0, y0], [x1, y1]]}`（書いた 2 点を結ぶ線分。ちょうど 2 つの `[x, y]`。縦の線も書ける）。2 本以上は配列にする
  - `series`：当てはめに使う系列の番号（0 から数える。1 つ目の系列が 0。数か番号の配列。既定は全部）
  - `label`：線の名前（図の上に書く）。`{r}` は相関係数、`{a}` は傾き、`{b}` は切片に置き換わる（`digits` 桁、既定 2）。例：`"傾向（r = {r}）"`
  - `step`：既定は最後の系列の次のステップ（線が何本あっても同じステップ）
  - 当てはめた直線は当てはめた点の x の範囲に、`pts` の線は書いた 2 点の間に引き、軸の枠の中で切る。枠の外に出る線は描かず、`ctx.report` で知らせる
  - `pts` の縦の線では `{a}` `{b}`（傾き・切片）は空になる。`{r}` は当てはめた直線だけ
- 軸の属性：`xr` `yr`（範囲）、`xt` `yt`（目盛り）、`xf` `yf`（目盛りの小数桁）、`xl` `yl`（軸の名前）。`xr` `yr` を書かなければデータから切りのよい範囲を、`xt` `yt` を書かなければ目盛りを決める
- 見せ方（`variant`）：`fade`・`sweep`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 授業の表示（`ctx.preview`）では、先のステップの点と線をテーマの薄さで見せる

### `<m-timeline>`

データ（子の `<script type="application/json">`）の見本: `{"nodes":[{"id":"a","label":"明治維新","when":"1868","whenLabel":"明治元年"},{"id":"b","label":"憲法の発布","when":"1889","note":"2 月 11 日"},{"id":"c","label":"日清戦争","when":"1894","end":"1895","tone":"emph"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `orient` | string | `"h"` | h（左から右へ）か v（上から下へ） |
| `scale` | string | `"time"` | time（時間に比例した間隔）か even（等間隔。間がとても不ぞろいなとき） |
| `per-step` | number | `1` | 1 ステップに出す出来事の数（0 = 全部をステップ 1 で） |
| `size` | number | `26` | 名前の字の大きさ（px。入らなければ 24 まで縮める） |
| `unit` | string | `""` | 目盛り：day・week・month |
| `today` | string | `""` | 今日の線（YYYY-MM-DD） |

歴史の年表、人物の生涯の重なり、計画の日程など、出来事を時間の順に見せるときに使う。
座標は書かない。中身と時刻だけを書けば、パーツが並べる（共通の決まり §2）。

子の JSON の並び：`edges` は省ける。

- `when`：時刻。数（`1868`、`-500`、`0.5` など）か、文字列 `"YYYY"` `"YYYY-MM"` `"YYYY-MM-DD"`。箱の上の行に日付として出る（日本語の資料なら「1868年」「2026年10月」）
- `whenLabel`：日付の行に、計算した日付の代わりに書く字（「明治元年」「平成の終わり」など）。位置は `when` で決まる
- `label`：名前（`\n` で改行）。または `tex`（KaTeX）
- `note`：箱の**中**の最後の行に小さく（`--muted`）。期間と節目では名前の後ろに続けて。例：「2 月 11 日」「新橋〜横浜」
- `tone`：`term`（既定）・`emph`・`muted`・`accent2`・`series-1..4`。`emph` の箱は地が `--emph-tint`、枠と字が `--emph`
- `end`：あれば期間。軸の下の段に帯で描き、名前は帯の中（入らなければ帯の右か左）に書く。名前を `\n` で何行かにすると、帯がその分太くなる
- `end` は含まない（終わりの時点）。`"1912"` は 1912 年の初め。明治 1868–1912 と大正 1912–1926 は同じ段に並ぶ。12 月まで含めるなら次の月（`"2027-01"`）を書く。
- `lane`：期間を名前の付いた段のまとまりに分ける（「時代」「作家」「設計」など）。まとまりの名前を左に書き、まとまりの間に薄い線を引く。重なる期間は、まとまりの中で自動で別の段に積む。`end` のない `node` に `lane` を書くと、その段の中の節目（◆）になる
- `step`・`at`：出るステップと、ステップの中の開始秒
- `edges`：ほかのつながり（`from` `to` `label` `tone` `dash` `step`）。箱の縁から縁への破線の矢印（`dash: false` で実線）
- 工程表：`after: ["id", …]`（前の作業の終わりから始まりへ矢印）、`progress`（0–100 %。濃く塗る）。今日の線は `today`、目盛りの単位は `unit`
  - `after` の矢印は期間（`end` のある node）か節目（`lane` のある node）のあいだだけ。`lane` のない出来事を指すと引かない。`today` の線は期間が 1 つ以上あるときだけ出る

並べ方：

- `orient`：`h`（既定、左から右へ）か `v`（上から下へ）
- `scale`：`time`（既定、時間に比例した間隔）か `even`（使った時刻を等間隔に。間がとても不ぞろいなとき）
- 出来事（`end` も `lane` もない node）は軸の上の点と、日付と名前の箱。箱は軸の上と下に交互に置く（`v` なら左と右）。混んでいて箱が点から離れすぎるときは 2 段にする
- 期間があるときは、軸に切りのよい目盛り（年・月・数）を付け、出来事の箱はすべて軸の上に置く（下は期間の段）
- ステップ：既定は時刻の順に 1 つずつ（期間も出来事も同じ列で数える）。軸は最初の出来事と一緒に引かれる
- 線：軸は `--muted` の 5 px（図の中心の線として 1 本だけ太い）。軸の目盛りと目盛りの字（図の字の大きさ）も `--muted`。段のまとまりの間の区切りの線だけ `--line`。箱から軸への線と `edges` は `--muted` の 3 px
- 見せ方（`variant`）：`fade`・`draw`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 動きの上限：どの見せ方でも箱が動くのは 12 px まで（箱の中心で測る）、時間も `fade` の長さの中（共通の決まり §1.2）
- 授業の表示（`ctx.preview`）：後のステップの出来事・期間をテーマの薄さで見せる
- `cues(k)`：同じステップに 2 つ以上あれば、2 つ目からの開始時刻を返す（台本の `{cue}` に合わせられる）

### `<m-tree>`

データ（子の `<script type="application/json">`）の見本: `{"nodes":[{"id":"r","label":"動物"},{"id":"a","label":"脊椎動物","parent":"r"},{"id":"b","label":"無脊椎動物","parent":"r"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `orient` | string | `"down"` | down（上から下、既定）か right（左から右） |
| `by` | string | `"level"` | ステップの分け方：level（深さごと、既定）か node（1 つずつ、深さ優先の順） |
| `link` | string | `"elbow"` | 親子の線：elbow（かぎ形、既定）か straight（まっすぐ） |
| `size` | number | `0` | 箱の字の大きさ（px。0 = 27 から入るまで 24 まで縮める） |

組織図、生物や物質の分類、概念の上位と下位、章と節の構成など、親子の関係で並ぶものを上から順に見せるときに使う。
座標は書かない（共通の決まり §2）。中身とつながりだけを書けば、パーツが重ならないように並べる。

子の JSON の並び：`edges` は省いてよい。

- node：`id`、`label`（`\n` で改行）か `tex`（KaTeX）、`parent`（親の `id`。`parent` のない節（根）はちょうど 1 つ）、`note`（箱の**下**に小さな一言、`--muted`）、`tone`（`term`（既定）・`emph`・`muted`・`accent2`・`series-1..4`）、`step`、`at`（ステップの中の開始秒）
- 子は配列の順に並ぶ。親は子の並びの中央に置く
- edge：親子のほかのつながり（`from` `to` `label` `tone` `dash` `step`）。破線で矢印つき、木の外側（`down` は下、`right` は右）へふくらむ。同じ深さの節どうしに向く。ステップは既定で両端の遅いほう
- 子の `branch`：線の字（確率など）。`path`：根からの `id` の道を順に強調（`pathStep` で一度に。`pathNote`：末尾の一言）
- `orient`：`down`（既定、上から下）か `right`（左から右。分類を横に広げるとき）
- `by`：`level`（既定。根、それから深さごとに 1 段）か `node`（深さ優先の順に 1 つずつ。1 つの枝をたどって話すとき）。節の `step` が勝つ
- `link`：親子の線。`elbow`（既定、かぎ形）か `straight`（まっすぐ）。線の色は `--muted`、3 px
- `tone: emph` の箱は、地が `--emph-tint`、枠と字が `--emph`
- 入る大きさの目安（1280×720 の本文、高さ 440 px ほど）：`down` は 1 段に 4 字ほどの箱が 8 個、`right` は 7 個ほど。深さは 5 段ほど。
  それより多い葉（子のない節）が 1 つの親に並ぶと、子を 2 段に互い違いに並べる（`down` で 16 個ほど、`right` で 11 個ほどまで）。
  さらに入らなければ名前を 2 行に折る。字は 24 px より小さくならず、入らない分は要素の箱からはみ出す（足りない px を `ctx.report` で知らせ、Studio の検査に出る）。多いときは木を分ける
- 見せ方（`variant`）：`fade`・`draw`・`grow`。書かなければ資料のシード値で選ばれる（書かなくてよい）
- 動きの上限：どの見せ方でも箱が動くのは 12 px まで（箱の中心で測る）、時間も `fade` の長さの中（共通の決まり §1.2）
- 授業の表示（`ctx.preview`）では、後のステップの箱と線をテーマの薄さで出しておく

### `<m-venn>`

データ（子の `<script type="application/json">`）の見本: `{"sets":[{"label":"哺乳類"},{"label":"海の生き物"}],"regions":{"A":["ライオン"],"B":["マグロ"],"AB":["クジラ","イルカ"]}}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `26` | 項目の字の大きさ（px）。収まらなければ 24 まで縮める |
| `spread` | number | `1` | 円の中心の間の距離 ÷ 半径（小さいほど重なりが広い。0.7〜1.3） |
| `overlaps` | string | `"together"` | together（重なりを 1 ステップでまとめて）か each（1 つずつ） |

2 つか 3 つのものの共通点と違い（哺乳類と海の生き物、3 つのスキルの重なり など）を、重なりで見せるときに使う。
観点ごとに値を並べて比べるなら `m-compare`。

- `sets`：集合（2 つか 3 つ）。`label` は円の外に書く名前、`tone` は円の色（`term`・`emph`・`muted`・`accent2`・`series-1..4`。既定は `term`・`accent2`・`series-4` の順）。`--emph` は重なりを強めるのに使うので、集合には使わないほうがよい
- `regions`：領域ごとの項目（1 つ 1 行の配列か、`\n` で改行した字）。鍵は集合の文字の組で、アルファベット順に書く。文字は `sets` の順（`sets` の 1 つ目が A・2 つ目 B・3 つ目 C）：
  - `A`：A だけ（ほかの集合には入らない）、`AB`：A と B の両方（3 つのときは、A と B に入り C には入らないところ）、`ABC`：3 つとも
  - 2 つなら `A` `B` `AB`、3 つなら `A` `B` `C` `AB` `AC` `BC` `ABC`。どれも省いてよい。集合が 2 つのときに C を含む鍵（`C` `AC` `BC` `ABC`）を書くと、図の代わりに誤りの札が出る
- 円は左右対称の決まった配置で、面積は値に比例しない（2 つは左右、3 つは左上・右上・下）。`spread`（既定 1）は円の中心の間の距離 ÷ 半径で、小さいほど重なりが広い
- 項目は、その領域の中で円の線から最も離れる位置に置く。字は `size`（既定 26 px）から 24 px まで縮める。重なりの項目は太字
- ステップ：既定は 集合を 1 つずつ（その集合だけの項目と一緒に）→ 重なり（項目のある重なりを `--emph` で薄く塗って縁を囲み、項目を出す。項目のある重なりがなければ重なりすべて）。`overlaps="each"` なら重なりを 1 つずつ（`AB`・`AC`・`BC`・`ABC` の順）
- 見せ方（`variant`）：`fade`・`draw`。書かなければ資料のシード値で選ばれる（書かなくてよい）
