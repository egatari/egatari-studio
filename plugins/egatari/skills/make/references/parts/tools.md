<!-- generated; do not edit by hand -->
# tools のパーツ

指示の版：b47ccdba

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-timer>` | グループワークの進行タイマー。区切りごとに残り時間を大きく数え、区切りの一覧で今の区切りを示す | 0 準備の画面、区切り 1 つが 1 ステップ（その長さ = sec 秒） | `{ready?:{title?:str,text?:str},phases:{title:str,short?:str,text?:str,sec:int,bells?:{left:int,count?:int}[]}[],bells?:{left:int,count?:int}[],done?:str,labels?:{ready?:str,total?:str,remaining?:str,done?:str,start?:str,next?:str,end?:str,min?:str,sec?:str,plus?:str,minus?:str}}` — phases は {"title", "sec"} の並び（sec は秒の整数。"3分" のような字ではない）。区切り 1 つが 1 ステップ |

### `<m-timer>`

データ（子の `<script type="application/json">`）の見本: `{"ready":{"title":"準備の確認","text":"用紙とペンがそろっているか"},"phases":[{"title":"① 付箋に書く","short":"付箋に書く","sec":180},{"title":"② 島で選ぶ","short":"島で選ぶ","sec":300}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `（なし）` |  |  |  |

依頼にグループワーク・作業時間・制限時間があるときだけ使う。→ キーでステップを進めると数え始める。

- `sec` は秒の整数（3 分なら 180）。`short` は右の一覧に出す短い名前、`text` は 2 行まで
- 最後の 1 分は赤、最後の 10 秒は時計が点滅
- 字は `<html lang>` で日本語か英語。`labels` で変えられる：`total` `remaining` `done` `start` `next` `end` `min` `sec` `plus` `minus`
- 実行系が対応していれば ＋1 分・−1 分のボタンが出る（同じスライドにいるあいだは延ばした時間が残る）
- ベル（学会タイマーのように）：`"bells": [{"left": 300, "count": 1}, {"left": 120, "count": 2}, {"left": 0, "count": 3}]`（残り秒と回数）。全体か区切りごとに書く。書かなければ鳴らない
