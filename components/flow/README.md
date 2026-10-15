---
name: m-flow
summary: 流れ図の箱と矢印を段階ごとに出して、図を組み立てる
steps: nodes と edges の step の最大
props: fade, draw, size
---

証明や手法の各ステップに合わせて箱と矢印を出し、文と図の対応を見せるときに使う
（motion-slides スキル §6「図を組み立てる」）。

子の JSON：`{"nodes": [...], "edges": [...]}`。座標は要素の箱の px（`x`, `y` は箱の左上、`w`, `h` は大きさ）。

- node：`id` `label`（`*斜体*` `_下付き` `^上付き`、`\n` で改行）または `tex`（KaTeX）、`step`、`tone`（`term` / `emph` / `muted`）、`at`（段階の中の開始秒）
- edge：`from` `to` `step`（既定は両端の箱の遅いほう）、`label`、`tone`、`dash`、`offset`（名前と線の距離）、`at`
- 箱は薄く拡大しながら現れ、矢印は同じ段階の箱が出てから引く

見本は `demo.html`（ベイズ決定の流れ）。
