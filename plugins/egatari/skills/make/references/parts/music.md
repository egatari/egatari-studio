<!-- generated; do not edit by hand -->
# music のパーツ

指示の版：35bff3e7

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-keyboard>` | ピアノの鍵盤。音階・和音・半音と全音を光らせる | steps の 1 つ = 1 ステップ（鍵盤は t でずらして順に光る） | `{range:str,names?:"solfa"\|"abc"\|"iroha"\|"none",cumulative?:bool,dur?:num,steps:{keys:str[],label?,t?:num[],tone?,dur?:num}[]}` — range "C4-C6"（使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで）、steps [{keys: ["C4", "E4"], label, t: [鍵盤ごとの秒], tone, dur}] |
| `<m-score>` | 楽譜（五線譜）を 1 音・和音ずつ、または 1 小節ずつ出して音も鳴らす。ABC 記譜法で書く | 音符・和音・休符 1 つ＝1 ステップ。by="measure" なら 1 小節＝1 ステップ（per-step="N" なら N 小節。弱起の小節は次のステップに入る） | `{abc:str}` — abc だけを書く（abcSvg・abcMap・renderers は組み立てが足す） |

### `<m-keyboard>`

データ（子の `<script type="application/json">`）の見本: `{"range":"C4-C6","names":"solfa","steps":[{"keys":["C4","E4","G4"],"label":"主和音（ドミソ）"}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `（なし。子の JSON）` |  |  |  |

- `range`：使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで
- `names`：`solfa`（ドレミ）・`abc`・`iroha`（ハニホ、嬰ハ・変ニ）・`none`
- `t`：鍵盤ごとの秒。ずらすと音階、同じなら和音
- `cumulative: true`：前のステップの鍵盤も薄く残す
- `tone`：光の色。`dur`：音の秒（既定は次の音まで、最後は 0.8）

### `<m-score>`

データ（子の `<script type="application/json">`）の見本: `{"abc":"X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F |]"}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `by` | string | `"note"` | note（1 音・和音ずつ）\| measure（1 小節ずつ） |
| `names` | string | `"none"` | 符頭の下の名前：solfa（ドレミ）\| abc \| iroha（ハニホ）\| none |
| `per-step` | number | `1` | by=\ |

- `abc`：ABC 記譜法。`M:` 拍子、`L:` 基本の長さ、`Q:1/4=96` 速さ、`K:` 調、`[CEG]` 和音、`z` 休符、`-` タイ
- `names`：符頭の下に `solfa`（ドレミ）・`abc`・`iroha`（ハニホ）。既定は `none`
- `by="measure"`：1 小節ずつ（音は小節の中で順に鳴る）
- `per-step="N"`：`by="measure"` で N 小節を 1 ステップにする（既定 1）。ステップの長さは N 小節の長さそのまま
- `by="note"` は音の名前・高さを 1 つずつ見せるためのもので、各ステップは 1.2 秒以上になりリズムは保たれない。リズムを聞かせるときは `by="measure"`。速い曲は `per-step` で 1 ステップが 1.2 秒以上になるように（弱起の小節は自動で次の小節とまとめる）
