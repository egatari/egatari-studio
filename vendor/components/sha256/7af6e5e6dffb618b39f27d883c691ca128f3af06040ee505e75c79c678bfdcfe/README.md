---
name: m-scroll
display: 縦に送る図 / Scrolling figure
version: 2.0.0
series: common
tier: specialized
set: tools
summary: 縦に長い図（インライン SVG・HTML）を高さの決まった枠に入れ、ステップごとに決めた所まで送る。参加者は枠の中を手でスクロールできる
steps: 子の data-scroll-step の最大（k 番目のステップでその要素の所まで送る）
purposes: process, timeline
props: dur, margin
origin:
  kind: student
  from: research
---

長い年表・長いフロー図・長いコードのように、1 枚のスライドに入らない縦長の図を、分けずに見せるときに使う。

`<m-scroll style="height:440px" aria-label="図の名前">` の子に、図（インライン SVG や `<pre>`）をそのまま書く。

- 子の要素に `data-scroll-step="k"`（1, 2, …）を付けると、k 番目のステップでその要素が枠の上に来るまで送る（上に `margin` px 空ける）。ステップの数は k の最大
- 枠の中のホイール・タッチ・↑↓・PageUp/PageDown は枠のスクロールで、スライドは送らない。←→ と Space はスライドの操作のまま
- 参加者が手で動かした所は、次のステップまで保たれる
<!-- llm: omit -->
```html
<m-scroll style="height:420px" aria-label="A 町の年表（架空）">
  <svg viewBox="0 0 1000 1310" width="1000" height="1310">… <g data-scroll-step="1">…</g> …</svg>
</m-scroll>
```

- 枠は `--line` の線で囲む。枠の外の中身はわざと切っている（`data-clip`）ので、品質チェックは欠けとして知らせない
- 動画（`?mode=video`）と印刷は、そのステップの作者の位置で描く。動きを減らす設定では送らずに移る
- パーツ自身は図を描かない。図の字の大きさ・色は図の側の決まり（24 px 以上、テーマの色）に従う
<!-- llm: end -->

サンプルは `demo.html`（架空の町の年表、架空のデータを集計する Python のコード）。

注意

- 読み上げのために `aria-label` に図の名前を書く（省略すると「縦に送る図」）
- 印刷・本では枠の中の見えている所しか残らない。全体を読ませたい図は、スライドを分けるか本の側に全体を置く
