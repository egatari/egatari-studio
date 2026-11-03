---
name: m-kpi
version: 2.0.0
series: common
tier: standard
summary: 大きな数字の札（KPI）を段階ごとに出す。数字は数え上げ、下に増減の矢印と一言
steps: 札の step の最大（既定は札 1 枚 = 1 段階。per-step で n 枚ずつ）
purposes: key-number
variants: count, rise, flip, underline
props: cols, digits, per-step, dur, stagger, count, size
---

表紙の直後の「掴みの数字」、試験導入の結果、市場規模の要約など、少数の数字を大きく見せるときに使う
（motion-slides スキル §6「数字を見せる」）。

子の JSON：`{"cards": [{"label", "value", "digits", "unit", "prefix", "from", "tone", "delta", "note", "step", "at"}, …]}`。

- `label`：札の上の名前。`value`：数字（`digits` 桁、3 桁ごとにカンマ）。`unit`：数字の後ろの単位（小さめの字）。`prefix`：数字の前の記号（`−` `+` `約` など）
- `from`：数え上げを始める値（既定 0。「20 分 → 7.5 分」のように減らす数も見せられる）
- `tone`：数字と札の上の帯の色（`term`（既定）・`emph`・`accent2`・`series-1..4`）
- `delta`：`{"dir": "up" | "down", "text": "前の期から 4 社", "good": true}`。▲ / ▼ と一言を数字の下に出す。良い向き（`good`、既定は `up` なら良い）なら `--term`、悪い向きなら `--emph`
- `note`：札の下端の一言（`--muted`）
<!-- llm: omit -->
- 数え上げは初めに速く終わりにゆっくり（ease-out）で、(k, t) だけで決まる（t = Infinity なら最後の値）。`count="false"` なら数えずに出す
<!-- llm: end -->
- 見せ方（`variant`、[共通の決まり](../../docs/conventions.ja.md) §1.7）：`count`（数え上げ、既定）・`rise`（最後の値のまま、少し小さい大きさから戻る）・`flip`（右の桁から 1 桁ずつめくれて止まる）・`underline`（出たあと数字の下に線を引く）。書かなければ最初の見せ方。`count="false"` なら数える見せ方は `rise` になる
- 札の並び：`cols`（既定は札の数、4 まで）列で、行が足りなければ折り返す
- `cues(k)`：同じ段階に 2 枚以上の札があれば、2 枚目からの開始時刻を返す（口述原稿の `{cue}` に合わせられる）

見本は `demo.html`（試験導入の結果、4 枚をまとめて出す例）。数値はすべて架空。

<!-- llm: omit -->
注意

- 数字と単位の幅は字数から見積もって札の中央にそろえる（字の読み込みを待たずに決まり、数え上げの間も数字の右端が動かない）。字の形によっては数文字ぶんずれることがある
<!-- llm: end -->
