---
name: make
description: Egatari Studio で、構成案から HTML の教材・ステップ・パーツ・台本を作る。チャットと CLI で使える。旧名 motion-slides（1 版のあいだ残す）。「motion-slides」「動きのあるスライドを作って」「Egatari にして」で使う。Use for making HTML lessons, animated slides and scripts.
---

<!-- generated; do not edit by hand -->

Always reply in the language the user writes in. Write slides and narration in the lesson's language.

# egatari:make：教材を作る

Egatari はオープンな教材の形式（[仕様](https://github.com/egatari/egatari-spec)）。Egatari Studio はその編集アプリ <https://studio.egatari.org/>。

**指示の版：ecca7b6f**。Studio でコピーした指示書の版と違えば、利用者に「新しいパーツがあります」（new parts are available）と知らせる。Claude Code では `/plugin update egatari@egatari` で make を更新する。チャットでは新しい版の make スキルを入れ直す。参照ファイルは自動で作るので、パーツが増えても本文を手で直さない。

## 進め方

まず材料・対象・長さ・言語・テーマを確かめ、構成案を見せる。各項目は見出し・伝えたいこと・おすすめのパーツと理由・結論の行・材料。数値を作らない。利用者が構成案とパーツを承認したら書く。話者は既定で 1 人、掛け合いは頼まれたときだけ。

コマンドを動かせないチャットでは、下の共通の書き方に従い、deck.html と narration.md の 2 つの囲みを返す。Studio の「新規作成」に貼り付けてもらう。修正依頼を受けたら、その指摘を直して返す。

## チャットでパーツを選ぶ

標準・専門のパーツは必要なセットだけ読む。特殊（extra）は README への道だけを載せる。大きさの上限や無料・有料の絞り込みは貼り付ける指示書だけのもので、このスキルには掛けない。ローカルの一覧と demo を直接読む作業は egatari-studio の studio スキルを使う。

- [common](references/parts/common.md)
- [academic](references/parts/academic.md)
- [business](references/parts/business.md)
- [kokugo](references/parts/kokugo.md)
- [english](references/parts/english.md)
- [info](references/parts/info.md)
- [social](references/parts/social.md)
- [music](references/parts/music.md)
- [extra](references/parts/extra.md)

## 本（本文の窓・article）と配置

本の本文は読む文章、台本はステップごとに話す言葉。本文を台本へ押し込まない（R-article）。配置は slides（スライド）・flow（続けて読む）・pages（ページ）・split（スライドと本文）。この版の Studio は slides の作成に対応する。本文の窓・article とほかの配置はまだ作れないので、必要なら制限を伝え、本文は別の下書きとして利用者と確認する。未対応の出力が Studio で開けると約束しない。

## 音声を付ける

チャットでは Studio の音声の板で付けてもらう（この PC で AI 音声を作る・録音・Google Colab）。

# AI への指示

指示の版：`ecca7b6f`

短い **Egatari の教材**を 1 つ書いてください。ステップごとに出る HTML のスライド（`deck.html`）と台本（`narration.md`）で、どちらも自動で組まれ、品質チェックを受けます。ここにないものは使えません。教材は頼まれた言語で書きます（スライドと台本は同じ言語）。規格には **R-fit** のような名前があり、修正依頼は破った規格を名前で示します。依頼は最後の **頼みたいこと**（かその前の会話）にあります。空の項目やない項目はほどよく決め、A と B が両方残っていれば書き込みのある方に従います。

**よくある失敗：**

- **2 つの囲みはどちらも最後まで書いて閉じる。**囲みの途中で終わらない（R-output）。構成案がなければ、教材は短くする（5〜8 枚）。指示に構成案とその範囲があれば、その範囲のスライドをちょうどその枚数だけ書く（エディタは 1 回に 6 枚までしか頼まないので、収まる）
- **1280×720 のスライドの大きさ**（品質チェックが測る。R-fit）：本文の場所は 1184 × 443 px（565 px まで。`noconcl` なら 1184 × 558）。字は 32 px・1 行 46 px で、入るのは**およそ 8 行**。はみ出す 46 px ごとに 1 行を削る。**図やパーツの中も含め、字はすべて 24 px 以上**
- **グラフと図：**パーツは大きさによらず字を 24〜28 px で描くので、決めるのはパーツの大きさ（R-fit）
- **その場で書く `<svg>`：**字は「表示の幅 ÷ viewBox の幅」で縮むので、viewBox を表示の画素で書く（`<svg viewBox="0 0 560 320" width="560" height="320">`）。`font-size` は 24 以上。`width:100%` と別の幅の viewBox を組み合わせない。合うパーツがあればパーツを使う

## 1. 出力の形

- **R-output** 返事は**ちょうど 2 つのコードの囲み**にし、この順で、名前を `deck.html` と `narration.md` にする（始まりの行は ```` ```deck.html ```` と ```` ```narration.md ````）。間には何も書かない（前後に 1 行の添え書きはよい）。1 つのファイルを囲みに分けない。ファイル・キャンバス・添付にせず、返事の本文に書く。ほかのファイルを参照しない（画像・`{{FIG:…}}`・`{{JSON:…}}`・外の URL・`<link>` は使わない）。囲みの途中で終わらない（長すぎるなら枚数を減らす。ただし構成案の範囲を頼まれたら、ちょうどその枚数）
- **R-outline** **構成案だけ**を頼まれたら（長い教材を 2 回に分けて作るとき）、`outline` という名前の囲み 1 つ（始まりの行は ```` ```outline ````）だけで返し、`deck.html` と `narration.md` は書かない：列が「番号」「見出し」「要点（1 行）」の Markdown の表で、スライドごとに 1 行、全スライドを順に。その後の指示は範囲を示す（「構成案の 7〜12 枚目」）ので、その見出しと要点のとおりに、ちょうどそのスライドを書く
- **R-noids** スライドの id を**書かない**。`<section class="slide">` に `id` を付けず、台本の見出しにも `{#…}` を付けない。id は取り込みでエディタが付ける。id のある教材を渡されたとき（修正依頼）は、今ある `id="…"` と `{#…}` をそのまま残す

## 2. deck.html

### 2.1 骨組み

```html
<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>教材の題名</title>
</head>
<body>
<div id="stage">
  <section class="slide cover noconcl static"> … </section>
  <section class="slide"> … </section>
</div>
</body>
</html>
```

- `lang`：`ja`・`en` など（教材の言語）。`data-theme`：ビジネス・ピッチは `sumi`、国語は `kokugo`、ほかは `default`
- `<script>` はパーツのデータ（§2.6）だけ。`<style>` は配置（大きさ・間隔）だけに使い、色は書かない

### 2.2 スライド

- 普通のスライド：`<h2>` の見出し、`<div class="body">…</div>`、`<div class="concl"><span>…</span></div>`（結論の行。短い 1 文）
- 表紙：`<section class="slide cover noconcl static">` に、あれば `<div class="venue">…</div>`、`<h1>題名</h1>`、あれば `<div class="au">…</div>`
- 章の扉：`<section class="slide sec noconcl static"><h1>章の題</h1></section>`
- `<section>` の class：`noconcl`（結論の行なし）、`static`（ステップなし）、`nostep`（箇条書きも初めから全部）、`layout-tate`（縦書き。kokugo の系列の指示があるときだけ）、属性 `data-morph`（§2.5）
- `.body` の中：`<p class="sub">` 小見出し、`<div class="big">` 主要な式、`<p class="note">` 補足、`<div class="thm">` 定理の枠、`<div class="cols">` 横並び、普通の `<p>` `<ul>` `<ol>` `<table>`
- 字の強調（色を付ける唯一の方法）：`term`（用語・問い）、`emph`（結論・問題・目標）、`muted`（既知の結果・控えめ）、`b`（太字）
- **R-headings** スライドの見出し（表紙と扉は `h1`、ほかは `h2`）は**すべて違う**ものにする（同じなら語を足す）。そのスライドの台本の節は `## ` に続けて**見出しとまったく同じ文字列**で始める（`<br>` などのタグは除く）
- **R-colors** 色はテーマだけで：上の class と式のマクロ `\hlE` `\hlT` `\hlM`。16 進・`rgb()`・色の名前・`\color`・`\textcolor` は使わない。パーツや SVG の中では：**色はテーマの CSS 変数だけ**を使う：`var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`。SVG では属性ではなく `style="stroke:var(--emph)"` で書く（`DECK.el` は `fill` `stroke` に `var(` があれば自動で style に回す）

### 2.3 ステップ（出す順 = 話す順）

- **R-steps** ステップ 0 は現れたときの姿で、文脈だけ（見出し・小見出し・導入の 1 文）。`data-step="k"`（k = 1, 2, …）の要素はステップ k で現れる。材料（箇条書きの項目・式・表の行・図の部分）は話す順に出す。式とそれを導く 1 文は同じステップ（`<div data-step="k">` で一緒に囲む）。1 枚のステップは 5 前後まで
- 結論の行は自動で**最後のステップ** `concl` になる（`data-step` を付けない）
- `data-step` が 1 つもないスライドでは、上の階層の箇条書きの項目（`.body > ul > li`・`.body > ol > li`）に 1, 2, … が自動で付く。1 つでもあれば自動にならないので、出すものすべてに付ける
- パーツは自分のステップを足す（§3）。`data-from`（既定 1）から始まる
- つまりステップは `0 … max` と、結論の行があれば `concl`。`static` のスライドはステップ 0 だけ

### 2.4 数式（KaTeX）

- **R-math** 行内は `\( … \)`、別行は `\[ … \]`。式の中の `<` は `\lt`、`>` は `\gt`。標準のほかに使えるマクロ：`\hlE{…}`（emph）`\hlT{…}`（term）`\hlM{…}`（muted）、`\htmlId{ID}{…}`、`\htmlData{mark=ID}{…}`、`\htmlClass{…}{…}`、`\morph{ID}{…}`。`\newcommand` と `\color` は使わない。記号は最初に使う所で定義する（`\(\mu\)`：母平均）

### 2.5 強調とモーフ

- **R-marks** 台本の `{mark:ID}`（§4）は、**同じスライド**の目印に印を付ける。目印：スライドの中の `id="ID"` か `data-mark="ID"` の要素。式の一部は KaTeX の `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}`（build はこの 2 つと `\htmlClass` だけを許す）。同じ ID を何枚かで使うなら `data-mark` にする（id は文書の中で一意に）
- モーフ（なくてよい）：`<section class="slide" data-morph>` は前のスライドの要素を今の位置へ滑らせる。両方のスライドの要素に同じ `data-id="…"`、式の一部は両方に `\morph{ID}{…}`。ステップ 0 で見えている要素だけが動く

### 2.6 パーツ

- **R-components** パーツは一覧（§3）の Web Components `<m-…>` で、`.body` の中に置く。どれにも高さ（`style="height:380px"`）と `aria-label` を付ける。データは子の `<script type="application/json">…</script>` **1 つ**にその場で書く。**図の数字は正しく**（計算する。見た目のために値を作らない。架空の数字は架空と書く）。関数の式は算術の式だけで、コードとしては実行されない（`Math.exp(x)`・`x**2`）。動きが説明になる所だけに使う（たいていのスライドには要らない）

### 2.7 表し方を選ぶ

- **R-purpose** 表し方は習慣でなく、そのスライドで伝えたいことから選ぶ。作者がグラフの種類を言っていればそれに従う。表は全パーツの一覧を兼ねる。使うのは渡された文章に説明のあるパーツだけ（§3 と、入っている系列）。ほかの系列のパーツの方が合うときは、1 行のメモでそう伝える

パーツの候補はセットごとの参照ファイルで選ぶ。

- **R-whole** 箇条書き・数字の札・円グラフは全体を一度に見せる。台本が 1 つずつ取り上げるときだけ 1 行ずつ出す（箇条書きなら全体に 1 つの `data-step` を付けるか、スライドに `nostep`）

### 2.8 スライドに収める（品質チェックのエラー）

- **R-title** 見出し：日本語は 26 字まで（全角 1・半角 0.5）、英語は 60 文字まで。コロンで終えない
- **R-concl** 結論の行：日本語は 35 字まで、英語は 70 文字まで。1 行
- **R-fit** 本文は 565 px（`noconcl` なら 680 px）より上で終える：1 枚におよそ 8 行・100 字・英語 60 語、または `big` の式 1 つと短い箇条書き 3 つ、または高さ 380 px までのパーツと短い 1 行（2 行なら 330 px まで）。入らなければスライドを分ける。字を縮めず、字の大きさを書かない。図の中の字は 24 px 以上
- **R-style** 日本語のスライドは常体（だ・である、体言止め）で、です・ます を使わない。句読点は教材全体で 1 つの組（`、。` か `，．`）。英語のスライドは短い句で

## 3. パーツの一覧

どの教材でも使えるパーツ。§6 の後に系列の指示があれば、その分野のパーツが加わる。「steps」はパーツが使うスライドのステップの数（`data-from` から。既定 1）。秒で測る属性（動きの長さ・ずれ）は載せない（既定で台本に合う）。型が json の属性は、値に JSON を書く（`values="[0.1,0.5]"`）。

パーツは上のセットごとの参照ファイルから、必要なものだけ読む。

## 4. narration.md

```markdown
# 台本：<教材の題名>

## 減衰の式
[0] 減衰の式です。時刻ごとに残っている原子の数を考えます。
[1] 残る数は、はじめの数に、時間とともに小さくなる指数関数を掛けたものです。
[2] {mark:n0|circle}{N₀|エヌゼロ} は、時刻ゼロのときの、はじめの数です。
[concl] 半分になるまでの時間は、崩壊定数だけで決まります。
```

- スライドごとに 1 つの節を、**スライドの順に、すべてのスライド（表紙も）について**：`## <スライドの見出し>`（R-headings）。`{#id}` は付けない（R-noids）
- **R-narr-steps** ステップの印は `[0]` `[1]` … と `[concl]`。**どのスライドのどのステップにも台本を書き**（ステップ 0 から max まで、結論の行があれば `[concl]`）、**ないステップの印は書かない**（`static` の表紙は `[0]` だけ。結論の行がなければ `[concl]` もない。`[01]` とは書かない）。ステップの中では、そのステップで現れるものだけを話す
- **R-dialogue** **既定は話者 1 人**で、話者名を書かない。掛け合いは頼まれたときだけ（3 人以上を頼まれても 2 役にし、最初にそう書く）：行を `Expert:` か `Novice:` で始め（続きの行は字下げ。話者なしは Expert）、認知的徒弟制の形にする：
  - Novice は相づち役にせず、学習者の疑問を代弁するか、「つまり〜ということですか」と言い換える
  - Expert は答えて具体例か比喩を 1 つ足すか、言い換えを確かめて（違えば直して）1 歩進める
  - 理解の分かれ目（誤解しやすい所、「なぜ」が残る所）にだけ、1 枚に 1 回・2〜3 発言まで。ほかは Expert 1 人
  - 「なるほど」だけの発言、前の発言のくり返しは書かない。例：`Novice: つまり、大きいほど早く着くのですか。` `Expert: いつもではありません。大きすぎると谷を飛び越えます。大股で坂を下りすぎて、向こうの斜面に足が着くように。`
- `{cue}`：ステップの中の同期点。パーツの `cues(k)` の 1 つに 1 つ（パーツの説明が求めるときだけ）
- `{mark:ID}`・`{mark:ID|効果}`・`{mark:ID|効果|hold=秒}`・`{mark:clear}`：目印のことを言う言葉の**すぐ前**に置く。1 ステップに 1〜2 個まで。言葉でも言う。効果：`underline`（既定。手描きの下線を左から右へ）、`circle`（手描きの囲み）、`box`（角丸の枠）、`spot`（対象のまわり以外を背景色で薄くする）、`laser`（光の点が対象の下へ滑ってきて少し留まる）
- **R-reading** `{表示|読み}` は **1 つの記号か 1 つの用語**の読み：`{θ|シータ}`、`{N₀|エヌゼロ}`、`{論語|ろんご}`。1 つの記号に星・プライム・添え字・ハットやバーが付いていてもよい（`{Q*|キュースター}`、`{θ̂|シータハット}`）。表示は普通の文字で書き、LaTeX にせず、式やいくつもの記号にしない（`{1-η|…}`・`{θとη|…}` は誤り：記号ごとに読みを付け、関係は言葉で言う）
- **R-formula** **式を読み上げない**：台本に LaTeX・`\`・`^`・`_`・`a + b = c` のような文字列を書かない。式の意味を言葉で言う（§4 の見本の [1]）
- 日本語の台本は話し言葉の です・ます。英語は話し言葉の英語。目安は 1 秒に日本語 5 字・英語 2.5 語。1 回の発言は 1〜3 文

## 5. 修正依頼

利用者が**修正依頼**（規格の名前の付いた指摘の一覧と、今のファイル）を貼り付けたら、その指摘だけを直し、ほかは変えず、`id="…"` と `{#…}` をすべてそのまま残し（R-noids）、また 2 つの囲みで返す（R-output）。依頼に一部のスライドしかなければ、そのスライドの `<section>` だけ（`<html>` なし）とその節だけを 2 つの囲みで返す（エディタが id で元の場所に戻す）。

## 6. 見本

小さな教材の見本（架空。形を見るためで、中身は写さない）。ステップの数え方：2 項目の箇条書きはステップ 1〜2 と `[concl]`、箱が 4 つの `m-flow` はステップ 1〜4。系列の指示の最後にもそれぞれ見本がある。

### 共通（英語・default テーマ・強調・m-flow）

```deck.html
<!DOCTYPE html>
<html lang="en" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How a web page arrives</title>
</head>
<body>
<div id="stage">

<section class="slide cover noconcl static">
  <div class="venue">Computing basics, lesson 1 (a fictional course)</div>
  <h1>How a web page arrives</h1>
</section>

<section class="slide">
  <h2>Two programs take part</h2>
  <div class="body">
    <p>Opening a page is a conversation between two programs.</p>
    <ul>
      <li id="browser">The <span class="term">browser</span> asks for the page and draws it</li>
      <li id="server">The <span class="term">server</span> keeps the page and sends it back</li>
    </ul>
  </div>
  <div class="concl"><span>Every page load is a request and a reply</span></div>
</section>

<section class="slide">
  <h2>From the address to the screen</h2>
  <div class="body">
    <m-flow style="height:300px" aria-label="Four stages: type the address, send a request, send the page back, draw the page">
      <script type="application/json">{"nodes": [
        {"id": "a", "label": "Type the\naddress", "x": 10, "y": 100, "w": 250, "h": 110, "step": 1},
        {"id": "b", "label": "Send a\nrequest", "x": 315, "y": 100, "w": 250, "h": 110, "step": 2},
        {"id": "c", "label": "Send the\npage back", "x": 620, "y": 100, "w": 250, "h": 110, "step": 3, "tone": "term"},
        {"id": "d", "label": "Draw the\npage", "x": 925, "y": 100, "w": 250, "h": 110, "step": 4, "tone": "emph"}
      ], "edges": [
        {"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "d"}
      ]}</script>
    </m-flow>
  </div>
  <div class="concl"><span>A slow page is slow in one of these four stages</span></div>
</section>

</div>
</body>
</html>
```

```narration.md
# Narration: How a web page arrives

## How a web page arrives
[0] Today we follow a web page on its way from a server to your screen.

## Two programs take part
[0] Opening a page is a conversation between two programs.
[1] {mark:browser}The browser is the program you look at. It asks for the page and then draws it.
[2] {mark:server}The server is a program on another computer. It keeps the page and sends it back when asked.
[concl] Every page load is a request and a reply.

## From the address to the screen
[0] Let us put the steps in order.
[1] First you type the address of the page.
[2] The browser turns it into a request and sends it to the server.
[3] The server finds the page and sends it back.
[4] The browser draws the page on the screen.
[concl] When a page is slow, one of these four stages is taking the time.
```

## 書き終えたら

egatari-studio が入っていれば、その studio スキルで品質チェックと組み立てを行う。入っていなければ、Chrome か Edge で <https://studio.egatari.org/> を開き、作業フォルダを開いてもらう。Mac の Safari では Egatari ファイル（.ega.html）で開く手順を使う。
