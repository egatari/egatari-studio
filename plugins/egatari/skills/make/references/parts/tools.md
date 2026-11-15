<!-- generated; do not edit by hand -->
# tools のパーツ

指示のバージョン：048faa50

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-callout>` | 画面の画像に番号の丸を置き、引き出し線で横の説明につなぐ。ステップごとに 1 つずつ（研修・手引き・操作の説明） | 説明の step の最大（既定は説明 1 つ = 1 ステップ。per-step で n 個ずつ） | `{callouts:{x:num,y:num,text:str,box?:[num,num,num,num],step?,at?}[]}` |
| `<m-checklist>` | 確かめる項目を並べ、ステップごとに 1 つずつ印（✓・×）を描く。印はスライドの中身で、見ている人の操作を保存しない | 項目の step の最大（既定は項目 1 つ = 1 ステップ。per-step で n 個ずつ） | `{items:{label,note?,mark?:"check"\|"cross"\|"none",step?,at?}[]}` |
| `<m-timer>` | グループワークの進行タイマー。区切りごとに残り時間を大きく数え、区切りの一覧で今の区切りを示す | 0 準備の画面、区切り 1 つが 1 ステップ（その長さ = sec 秒） | `{ready?:{title?:str,text?:str},phases:{title:str,short?:str,text?:str,sec:int,bells?:{left:int,count?:int}[]}[],bells?:{left:int,count?:int}[],done?:str,labels?:{ready?:str,total?:str,remaining?:str,done?:str,start?:str,next?:str,end?:str,min?:str,sec?:str,plus?:str,minus?:str}}` — phases は {"title", "sec"} の並び（sec は秒の整数。"3分" のような字ではない）。区切り 1 つが 1 ステップ |

### `<m-callout>`

データ（子の `<script type="application/json">`）の見本: `{"callouts":[{"x":0.12,"y":0.08,"text":"メニューを開く"},{"x":0.7,"y":0.62,"text":"「送る」を押す"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `side` | string | `"right"` | 説明を置く側：right・left・both（both は画像の左半分の丸を左に、右半分の丸を右に） |
| `label-width` | number | `0.32` | 説明の列の幅（要素の幅に対する割合。both なら片側の幅） |
| `per-step` | number | `1` | 1 ステップに出す説明の数（0 = 全部をステップ 1 で） |
| `size` | number | `28` | 説明の字の大きさ（px、24 以上） |

研修・職員向けの手引き・アプリの使い方で、画面のどこをどの順に操作するかを 1 つずつ見せる。

画像は子の `<img src="screens/apply.png" alt="…" width="1280" height="800">`（作業フォルダの画像。組み立てが教材に埋め込む）。

- **画面の画像に本当の個人の情報を写さない**（名前・番号・住民や患者の記録など）。架空のデータで画面を作るか、ぼかしてから使う
- `alt`（何の画面か）・`width`・`height`（画像の px）は必ず書く（ないと data）。1 MiB を超える画像は size

- callout：`x`・`y`（丸の位置。画像の幅と高さに対する割合 0〜1）、`text`（説明。`\n` で改行）、`box`（`[x, y, 幅, 高さ]`、同じ割合。そのステップの間だけ操作する所を `--emph` の枠で囲む）、`step`、`at`
- 説明は画像の横（`side`：`right`（既定）・`left`・`both`）に、丸の上下の順に並ぶ。重なれば下へずらし、引き出し線どうしは交わらない

注意

- 1 枚に 6 つくらいまで。手順が多ければ画面を分ける
- 丸が操作する所を隠さず、引き出し線がその上を通らないよう、x・y はボタンや欄の、説明の側の端に置く（side="right" なら右の端）

### `<m-checklist>`

データ（子の `<script type="application/json">`）の見本: `{"items":[{"label":"名札を付けた"},{"label":"手を洗った","note":"30 秒"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `reveal` | bool | `false` | 項目もそのステップで現れる（false なら項目はステップ 0 から全部見え、印だけがステップごとに付く） |
| `per-step` | number | `1` | 1 ステップに印を付ける項目の数（0 = 全部をステップ 1 で） |
| `size` | number | `32` | 項目の字の大きさ（px、24 以上）。メモはその 0.8 倍（24 以上） |

研修の手順の確かめ、作業の前の点検、窓口の持ち物、手術や処置の前の確認など、項目を 1 つずつ確かめていくときに使う。

- item：`label`（`\n` で 2 行）、`note`（項目の下に小さく書くメモ）、`mark`（`check`（既定）・`cross`・`none`）、`step`、`at`
- `reveal="false"`（既定）：項目はステップ 0 から全部見え、ステップごとに次の項目の箱に印を描く。`reveal="true"`：項目もそのステップで現れ、続けて印を描く
- 印はスライドの中身（作者が決めた ✓ と ×）。見ている人が押しても変わらず、何も保存しない（学習者のデータを持たない）

注意

- 1 枚に 8 項目くらいまで。それより多ければスライドを分ける
- 押して印を付ける「できたかな」の一覧ではない（学習者の操作を残すと個人のデータになる）

### `<m-timer>`

データ（子の `<script type="application/json">`）の見本: `{"ready":{"title":"準備の確認","text":"用紙とペンがそろっているか"},"phases":[{"title":"① 付箋に書く","short":"付箋に書く","sec":180},{"title":"② 島で選ぶ","short":"島で選ぶ","sec":300}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `（なし）` |  |  |  |

依頼にグループワーク・作業時間・制限時間があるときだけ使う。→ キーでステップを進めると数え始める。

- 区切り（`phases`）は 8 つまで。`sec` は秒の整数（3 分なら 180）。`short` は右の一覧に出す短い名前、`text` は 2 行まで
- 最後の 1 分は時計と棒が強調の色（テーマの `--emph`）、最後の 10 秒は時計が点滅
- 字は `<html lang>` で日本語か英語。`labels` で変えられる：`ready` `total` `remaining` `done` `start` `next` `end` `min` `sec` `plus` `minus`
- 実行系が対応していれば ＋1 分・−1 分のボタンが出る（同じスライドにいるあいだは延ばした時間が残る）
- ベル（学会タイマーのように）：`"bells": [{"left": 300, "count": 1}, {"left": 120, "count": 2}, {"left": 0, "count": 3}]`（残り秒と回数）。全体か区切りごとに書く。書かなければ鳴らない
