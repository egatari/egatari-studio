---
name: m-quad
version: 2.0.0
series: common
tier: standard
summary: 2 軸の位置づけ（ポジショニングマップ・SWOT 風の 4 象限）に、点を段階ごとに 1 つずつ置く
steps: 点の step と to.step の最大（既定は点 1 つ = 1 段階）
purposes: position
props: fade, move, size, quads-step
---

競合と自社の位置づけ、施策の分類（効果×手間）、SWOT のように、2 つの軸の上に項目を 1 つずつ置いて
「空いている場所」を見せるときに使う（motion-slides スキル §6「位置づける」）。

子の JSON：`{"x": {"lo", "hi"}, "y": {"lo", "hi"}, "quads": {"tr", "tl", "bl", "br", "fill"}, "items": [...]}`。

- `x` `y`：軸の両端の言葉（横軸は軸の下の両端、縦軸は軸の上端と下端の外）。軸と言葉は段階 0 から見える
- `quads`：象限の名前（tr = 右上、tl = 左上、bl = 左下、br = 右下）。`fill` に象限の名前（`"tr"` など）を書くとその象限を淡く塗り、名前を `--term` で書く。名前は `quads-step` の段階で現れる（既定 0 = 初めから）
- item：`label`、`x` `y`（0〜1。0.5 が軸の交わるところ）、`step`（既定は前の点の次の段階）、`at`（段階の中の開始秒）、`tone`（`term` / `fg`、既定は `--muted`）、`anchor`（名前の位置：`right`（既定）・`left`・`above`・`below`）、`r`（丸の半径）
- `self: true` の点は `--emph` で大きく描き、現れたときに輪が 1 回広がる（最終状態では輪は出ない）
- `to: {"x", "y", "label", "step", "at"}`：移動先。`to.step`（既定は点の次の段階）に、点が破線の跡を引きながら滑り、着いたら移動先の上に `label` を出す
- `cues(k)`：同じ段階に 2 つ以上の点があれば、2 つ目からの開始時刻（at）を返す。口述原稿の `{cue}` の数と合えば、点が言葉に合わせて現れる

見本は `demo.html`（報告書づくりの道具の位置づけ、SWOT 風の分類）。社名と位置はすべて架空。

注意

<!-- llm: omit -->
- 名前が軸の線を横切るときは、丸の反対の側 → 上 → 下の順に置き直す（点の始めの位置と `to` の位置の両方で。幅は字数からの見積もり）。`anchor` を書いても、横切るならこの順で置き直す。軸の線には `class="axis"` が付き、`tools/test-components.mjs` は軸を横切る字を知らせる
<!-- llm: end -->
- 象限の名前（tr など）や移動先の名前との重なりは置き直さない。重なるときは `anchor` を変えるか、座標をずらす（`tools/test-components.mjs` が重なりを知らせる）
