---
name: m-kpi
version: 2.0.5
series: common
tier: standard
summary: 大きな数字のカード（KPI）をステップごとに出す。数字は数え上げ、下に増減の矢印と一言
steps: カードの step の最大（既定はカード 1 枚 = 1 ステップ。per-step で n 枚ずつ）
purposes: key-number
variants: count, rise, flip, underline
props: cols, digits, per-step, dur, stagger, count, size
---

表紙の直後の「掴みの数字」、試験導入の結果、市場規模の要約など、少数の数字を大きく見せるときに使う
（motion-slides スキル §6「数字を見せる」）。

子の JSON：`{"cards": [...]}`。カードごとに `step`・`at` も書ける。

- `label`：カードの上の名前。`value`：数字（`digits` 桁、3 桁ごとにカンマ）。`unit`：数字の後ろの単位（小さめの字）。`prefix`：数字の前の記号（`+` `約` など）。負の `value` は自分で − が付くので、`prefix` に `−` を重ねない（`"prefix": "−"` と `-12` は「−−12」）。減った量を正の数で見せるときだけ `value` を正にして `prefix: "−"`
- `from`：数え上げを始める値（既定 0。「20 分 → 7.5 分」のように減らす数も見せられる）
- `tone`：数字とカードの上の線の色（`term`（既定）・`emph`・`accent2`・`series-1..4`）
- `delta`：`{"dir": "up" | "down", "text": "前の期から 4 社", "good": true}`。▲ / ▼ と一言を数字の下に出す。良い向き（`good`、既定は `up` なら良い）なら `--term`、悪い向きなら `--emph`
- `note`：カードの下端の一言（`--muted`）
<!-- llm: omit -->
- 数え上げは初めに速く終わりにゆっくり（ease-out）で、(k, t) だけで決まる（t = Infinity なら最後の値）。`count="false"` なら数えずに出す
<!-- llm: end -->
- 見せ方（`variant`、[共通の決まり](../../docs/conventions.ja.md) §1.7）：`count`（数え上げ、既定）・`rise`（最後の値のまま、少し小さい大きさから戻る）・`flip`（右の桁から 1 桁ずつめくれて止まる）・`underline`（出たあと数字の下に線を引く）。書かなければ最初の見せ方。`count="false"` なら数える見せ方は `rise` になる
- カードの並び：`cols`（既定はカードの数、4 まで）列で、行が足りなければ折り返す
- `cues(k)`：同じステップに 2 枚以上のカードがあれば、2 枚目からの開始時刻を返す（台本の `{cue}` に合わせられる）

サンプルは `demo.html`（試験導入の結果、4 枚をまとめて出す例）。数値はすべて架空。

<!-- llm: omit -->
注意

- 数字と単位の幅は字数から見積もってカードの中央にそろえる（字の読み込みを待たずに決まり、数え上げの間も数字の右端が動かない）。字の形によっては数文字ぶんずれることがある
<!-- llm: end -->
