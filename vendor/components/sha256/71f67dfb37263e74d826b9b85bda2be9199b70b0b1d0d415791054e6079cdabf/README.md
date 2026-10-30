---
name: m-curves
series: common
summary: 同じ座標軸に線を 1 本ずつ引く（線の名前は凡例でなく線の端に直接書く）
steps: step の最大（既定は系列の数）
purposes: change
props: xr, yr, xt, yt, xf, yf, xl, yl, n, dur, lw
---

同じ予測分布に平均・中央値・分位点を順に引く、損失関数を 1 つずつ重ねる、など
「一つの図で比較の軸を一つずつ見せる」ときに使う。

系列は子の `<script type="application/json">` に配列で書く。
1 系列 = 1 段階（書いた順）。`step` で変えられ、同じ `step` の系列は一緒に引く。口述原稿の [n] はこの段階に合わせる。

| 欄 | 意味 |
|---|---|
| `label` | 線の名前（`*斜体*` `_下付き` `^上付き`） |
| `f` | x の算術の式（`exp(…)` `sqrt(…)` `PI` などの `Math` の関数と定数、`N(x, 平均, 標準偏差)`、`+ - * / % **`、比較と `? :`。下を見よ）。`xr` で描く範囲を狭められる |
| `pts` | 点列 `[[x, y], …]`（縦線や実測の折れ線） |
| `tone` | `term` `emph` `accent2` `muted` `fg` `series-1..4`（既定は `series-1..4` の順） |
| `dash` | 破線 |
| `labelAt` / `anchor` / `dx` / `dy` / `ly` | 名前の位置：横軸の値 `labelAt` の点に置く（既定は線の端）。`anchor` は向き（`right` `left` `above` `below`）。`ly` は縦軸の値で高さを決める |

`f` は算術の式で、コードとしては実行しない（v1.0.2 から。[SECURITY.md](../../SECURITY.md)）：数、`x`、`Math` の関数と定数（`sin(x)` とも `Math.sin(x)` とも書ける。`Math.random` は使えない）、`N(x, 平均, 標準偏差)`、`+ - * / % **`、比較（`< <= > >= == !=`）、`&& || !`、`? :`、括弧。べき乗は `**`（`^` は書けない）。書けない式は図の代わりに札が出る。

<!-- llm: omit -->
古い書き方（今も動く。AI 向けの説明には書かない）

- `color`：`tone` の古い名前（両方あれば `tone`）。`var(--…)` もそのまま使える
- `at`：`labelAt` の古い名前で、`labelAt` がないときだけ効く。ほかの部品（`m-scatter` など）の `at` は「段階の中の開始秒」なので意味がぶつかる。かといって `at` を開始秒に変えると古い教材の名前の位置が変わるので、`at` は名前の位置のまま残し、説明には `labelAt` だけを書く
- `anchor` の `start` `middle` `end`：text-anchor そのもの（`right` = `start`、`left` = `end`、`above` / `below` は `middle` で、点の上・下に約 0.9 字ぶん離す。`below` が軸の下にはみ出すときは上に置く）
- `step` を書かなければ系列 i（0 から）は段階 i + 1 で、今までと同じ。授業の表示で先の線を薄く見せることはしない（今までどおり）
- 見本は `demo.html`（予測分布と代表値、損失関数の形、段階をそろえた線と `below` の名前）
- 使いどころは motion-slides スキル §6「線を 1 本ずつ引く」
- 系列の語（`label` `tone` `step` `anchor`）は `m-scatter` と同じ（共通の決まり §3）
<!-- llm: end -->
