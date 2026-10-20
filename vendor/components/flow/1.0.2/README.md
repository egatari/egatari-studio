---
name: m-flow
series: common
summary: 流れ図の箱と矢印を段階ごとに出して、図を組み立てる
steps: nodes と edges の step の最大
props: fade, draw, size, pulse-dur, pulse-n, label-gap
---

証明や手法の各ステップに合わせて箱と矢印を出し、文と図の対応を見せるときに使う
（motion-slides スキル §6「図を組み立てる」）。

子の JSON：`{"nodes": [...], "edges": [...]}`。座標は要素の箱の px（`x`, `y` は箱の左上、`w`, `h` は大きさ）。

- node：`id` `label`（`*斜体*` `_下付き` `^上付き`、`\n` で改行）または `tex`（KaTeX）、`step`、`tone`（`term` / `emph` / `muted`）、`at`（段階の中の開始秒）
- edge：`from` `to` `step`（既定は両端の箱の遅いほう）、`label`、`tone`、`dash`、`offset`（名前と線の距離）、`at`
- 箱は薄く拡大しながら現れ、矢印は同じ段階の箱が出てから引く

<!-- llm: business -->
お金・モノの流れ（ビジネスモデルの図）のための edge の欄（書かなければこれまでと同じ）：

- `kind`：`money`（`--emph` の太線）・`service`（`--term`）・`data`（`--muted` の破線）。`tone` と `dash` を書けばそちらが勝つ
- `amount`：金額などを太字で添える。`label` もあれば線の反対の側に書く
- `shift`：線に垂直に（進む向きの右へ）ずらす px。同じ 2 つの箱の行きと帰りを `shift` を同じ値にして 2 本並べる。字はずらした側に書く
- `pulse`：点の列（`pulse-n` 個、0.22 秒おき）が始点から終点へ `pulse-dur` 秒で流れる。`true` なら辺の段階に（引き終わってから）1 回、`[段階, …]` ならその段階ごとに 1 回（辺の段階でなければ `pulseAt` 秒、既定 0.2 秒から）。位置は (k, t) だけで決まり、流れ終わると消える（最終状態には出ない）。`pulse` の段階は図の段階の数にも数える
- 辺の名前と `amount` は、箱に `label-gap`（既定 12）px より近いか図の外に出るなら、線から 6 px ずつ（60 px まで）離し、それでも離れなければ線の反対の側で試す（名前と金額が両側にあるときは自分の側だけ）。幅は字数からの見積もり。箱の矩形には `class="box"` が付き、`tools/test-components.mjs` はほかの箱に 4 px より近い字を知らせる。離した名前は線から遠くなるので、箱の間は名前が収まる幅にしておく
- `cues(k)`：pulse の開始時刻を返す（pulse のない図はこれまでどおり null）。口述原稿の `{cue}` の数と合えば、「お金は〜から〜へ{cue}」に合わせて流れる
<!-- llm: end -->

見本は `demo.html`（ベイズ決定の流れ、お金とサービスの流れ）。
