<!-- i18n: pair=kokugo.md sha256=290c265c47e8f5f4 -->
## パーツの束：kokugo（国語）

国語（漢文・古文・現代文）の教材向け。テーマは `kokugo`。台本では、難しい語や名前に読み `{表示|読み}` を付ける（R-reading）。

- **縦書きのスライド：**`<section class="slide layout-tate">` でスライド全体を縦書きにする。`<h2>` は右端の縦 1 列（全角でおよそ 14 字。折り返さない）、本文は右から左へ列を重ね、結論の行は左端の縦 1 列（およそ 19 字）。本文は 2 つの列の間に収める（重なれば品質チェックが指摘する）。本文の中のパーツ・図・表は横書きのまま置かれるので、パーツの縦書きの指定を使う（<!--part:m-kobun-->`m-kobun tate`<!--/part--><!--part:m-kobun,m-gendai-->・<!--/part--><!--part:m-gendai-->`m-gendai tate`<!--/part--><!--part:m-kanbun-->。`m-kanbun` はいつも縦書き<!--/part-->）

この束のパーツ（§3 のパーツに加えて）：

{{CATALOG}}

{{EXTENSIONS}}

{{WORKED kokugo "見本：国語（kokugo テーマ・m-kanbun）" m-kanbun}}

<!--part:m-kanbun-->段階の数え方：`m-kanbun` は訓点（段階 1）、読む順は句ごとに 1 段階、最後に書き下し文。`[n]` は句ごとに書く。<!--/part-->
