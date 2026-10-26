---
name: m-menu
series: common
summary: スライドへのリンクの札を格子に並べる（目次・単元の選び方）。札はふつうの <a href="#<スライドの id>">、行ったスライドの札に「見た」の印
steps: ceil(札の数 / per-step)（既定の per-step="0" なら 0：初めから全部）
purposes: contents
props: cols, per-step, size, fade, stagger, visited
---

目次、授業の単元の選び方、「どこから見るか」を選ばせる 1 枚に使う。
<!-- llm: omit -->
札は子に書いたふつうのリンクで、部品は見た目（格子・丸の字・副題・印）を整えるだけ。押したときの動きは実行系（`kit/deck.js`）が受け持つ
（[format spec §9.1A](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#91a-links-to-slides)、`docs/contract.md` §9）。

<!-- llm: end -->
```html
<m-menu cols="3" aria-label="今日の内容">
  <a href="#s-njd4kp" data-icon="一" data-sub="孟浩然">春暁</a>
  <a href="#s-uhqygr:2" data-icon="二" data-sub="読む順から">春望</a>
  <a href="lesson2.ega.html" data-sub="次の課">返り点の練習</a>
</m-menu>
```

- 子の `<a href>` 1 つが札 1 枚。`href` は `#<スライドの id>`（その段階 0）か `#<id>:<段階の鍵>`（`0`・`1`・… か `concl`）。id は `npm run ids` が付けたもの。中身（文字・`<b>` など）が札の題になる
- `data-icon`：題の左の丸に入れる短い字（`一`・`1`・`A` など。色は `--term`）。`data-sub`：題の下の副題（`--muted`）
<!-- llm: omit -->
- ほかのファイルへのリンク（`other.ega.html#s-…`）はふつうのリンクで、札の右下に「別のファイル」の印。そのファイルは 1 ファイル（.ega.html）には入らない
- 押すと：発表ではその段階の最終状態へ、自動再生中ならそこから再生を続ける。行った先の左上に「戻る」（Backspace・Alt+←・ブラウザの戻る）
- 「見た」の印：このセッションで札の行き先のスライドを開いたら、札の右上に ✓（保存しない。開き直すと消える）。動画では付けず、印刷に出ない。
  発表の操作の側の表示で `DECK.seek(i, k, t)` の外（`m-kobun` の札と同じ扱い）。`visited="false"` で付けない
<!-- llm: end -->
- 段階：`per-step="n"` なら札が n 枚ずつ段階ごとに出る（`data-from` から。同じ段階の中は `stagger` 秒ずつずれる）。まだ出ていない札は押せず、Tab でも選べず、読み上げない。
  `per-step="0"`（既定）なら初めから全部（段階を使わない）。段階は (k, t) だけで決まる
- 並び：`cols`（既定は札の数から：3 枚までは 1 行、4 枚は 2 列、それより多ければ 3 列）。札の高さの下限は CSS の `--mm-h`（既定 104px）、間は `--mm-gap`（18px）。
  本文いっぱいに置いて縦の真ん中にそろえるなら `style="height:100%;align-content:center;--mm-h:150px"`
<!-- llm: omit -->
- 字の大きさ：題は `size`（既定 34px）、副題はその 0.8 倍（本文の下限の 27px より小さくしない）
<!-- llm: end -->

見本は `demo.html`（4 枚、2 枚ずつ出る目次）と `examples/kokugo-kanbun` の 2 枚目（6 枚の目次）。

<!-- llm: omit -->
注意

- スクリプトなしで開いたとき（1 ファイル（.ega.html）の読める層、印刷の前の HTML）は、ふつうのリンクの並びとして読める
- 部品は札の中身を組み替える（題・副題・丸の字を `span` で包む）が、`<a>` とその `href` は書いたまま
- CSS の transition は使わない（実時間で動くので、画面が (k, t) で決まらなくなる）
<!-- llm: end -->
