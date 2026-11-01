---
name: m-cards
version: 2.0.0
series: common
tier: standard
summary: カード（番号の丸・アイコン・見出し・説明）を横一列か 2 段に並べ、段階ごとに出す。矢印で順を、枠の色で強調を見せる
steps: カードの step の最大（既定はカード 1 枚 = 1 段階。per-step で n 枚ずつ）
purposes: process, grouping
variants: rise, fade, draw
props: layout, arrows, nums, hilite, per-step, stagger, dur
---

手順（聞く → まとめる → 返す）、要点の 3〜4 つ、事例の 2×2 の札などを、アイコン付きのカードで見せる。

子の JSON：`{"cards": [{"n", "icon", "title", "text", "step", "tone"}, …]}`（2〜6 枚）。

- `title`：見出し（必須。2 行まで）。`text`：説明（入るだけ折り返す。入らなければ … で切って知らせる）
- `icon`：アイコンの名前（Tabler Icons の線の形。下の一覧から。ほかの名前も使えるが、ない名前は点線の四角になって知らせる）
- `n`：番号の丸に出す字（`"A"` `"1"` など）。`nums` を付けると n のないカードに 1, 2, 3 … を出す
- `tone`：番号の丸とアイコンの色（`term`（既定）・`emph`・`accent2`・`series-1..4`）
- `layout="grid"`：2 段（4 枚までは 2×2、5〜6 枚は 3×2）。横に広いカードは 番号・アイコン・見出しを 1 行に並べる
- `arrows`：カードの間に順の矢印（grid では 1→2→3→4 の Z の順）。`hilite="last"` か `hilite="3"`：そのカードを `--emph` の枠と地で強調
- 見せ方（`variant`、[共通の決まり](../../docs/conventions.ja.md) §1.7）：`rise`（下から、既定）・`fade`（その場で）・`draw`（枠と矢印を描いてから中身）

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

見本は `demo.html`（窓口の進め方、4 つの店の工夫、まとめて出す）。会社と数字はすべて架空。

<!-- llm: omit -->
作る人向けの注

- **アイコン**はライブラリ部品 `icons`（Tabler Icons outline、MIT）から名前で引く。組み立てはレッスンに書かれた名前のアイコンだけを残す（仕様 §6.2 subset by name）。名前はすべてレッスンのデータから来るので `keep` はいらない。色は `currentColor` で、カードが `color: var(--<tone>)` を与える
- **大きさ**：カードの幅と高さから、アイコン（32〜64 px）・見出し（26〜34 px）・説明（24 px、行の高さ 34 px）を決める。字の幅は字数から見積もる（和文 1 字、欧文 0.6 字）
- **折り返し**：空白・読点の後ろ、平仮名の後ろで平仮名でない字の前、欧文と和文の境で折る。小さい仮名・長音・句読点・閉じ括弧は行の頭に置かない。入らなければ最後の行を … で切って `ctx.report("layout", …)` を 1 回
- **読み上げ**：svg は `role="list"`、カードは `role="listitem"` で、番号・見出し・説明をつないだ `aria-label`。アイコンと矢印は `aria-hidden`
- 授業の表示（`ctx.preview`）では後の段階のカードを最後の形でテーマの `--preview-opacity` の濃さに。印刷と動画は最後の段階
<!-- llm: end -->
