<!-- i18n: pair=article.md sha256=1f57ec83be0e0c1b -->
# 本を書く（article.md）

[English](article.md) | 日本語

教材は、スライドと台本の横に**本**（教科書の章・論文などの長い文章）を持てます。本は **Egatari Text 1** で書きます。MyST Markdown の小さな一部を固定したもので、[形式の仕様 §9C](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#9c-article-layer-feature-article-v1-draft)（草案）が決めています。このページは Studio の短い手引きで、決まりの本文は仕様です。

> 作業中（v0.6.5）。Studio は本を読み、点検し、別のページとして組みます。引用を書式で組み、本を Egatari ファイル（.ega.html）に入れ、つないだスライドと節が合っていないかもしれないときに知らせます。再生の画面はスライドの横か本だけで見せ（[スライドと本](reference.ja.md#スライドと本)）、編集アプリは直して印刷します（[編集アプリ](editor.ja.md)）。

## 作業フォルダのファイル

| ファイル | 中身 |
|---|---|
| `article.md` | ファイル 1 つの本（論文や、講義の 1 章） |
| `article/<名前>.md` | 章ごとにファイルを分けた本。読む順は、`egatari.json` に `article.chapters` があればその順。なければ前書き・章・付録・後書きの順で、それぞれの中はファイルの名前の順（例：`00-preface.md`、`01.md`、`02.md`、`90-answers.md`）。`npm run ids` はその順を、ある `egatari.json` に書く。`article.md` と `article/` のどちらか一方だけを使う |
| `references.json` | 文献（CSL-JSON。Zotero・pandoc・Crossref の書く形）。全部の章で 1 つ |
| `images/…` | 本で使う画像。作業フォルダの中のパスで書く（URL は使えない） |

`node kit/build.mjs <deck.html>` は本を `out/deck.article.html`（スクリプトのいらない 1 ページ）にも書き、問題があれば出します。`node kit/check.mjs <deck.html>` はスライドと合わせて本を点検します（M の項目。`--json` のコードは `article…`）。小さな見本は [tools/fixtures/article-book](../tools/fixtures/article-book/) にあります。

## 前付け（front matter）

ファイルの頭には次の項目だけを書けます。

```markdown
---
title: 平均と中央値
chapter: 1
---
```

| 項目 | 意味 |
|---|---|
| `title`・`subtitle` | 章の題（章のファイルには必ず書く）。本の題は教材の題 |
| `chapter` | 章の番号（正の整数）。読む順に大きくなる。1 から始まらなくてよい |
| `kind` | `preface`（前書き）・`chapter`（章。既定）・`appendix`（付録）・`afterword`（後書き）。ファイルはこの順に並べる。前書きと後書きは節の番号なし。付録は A・B…と記号が付き、`chapter` は書かない |
| `numbering` | `false` でこのファイルの節の番号を付けない（図と式の番号は付く） |
| `writing-mode` | `vertical-rl` で縦書き（国語など）。表も縦組み（行が 1 列になり、1 行目が右端、行のセルは上から下へ。セルの 1〜2 桁の数字は縦中横）。表は天付き（表・表題・本文のセルは行の頭から。見出しのセルと行の見出しはセルの中で中央）。図・式・コードは横組みのまま。頁は初め（右端）を開く。段落の頭の全角の空白（U+3000）は残るので、青空文庫のように字下げした段落はそのまま字下げになる |
| `lang`・`bibliography` | 書くなら、教材の言語・`references.json` と同じにする。全部の章で同じ |

## 書けるもの

CommonMark の書き方（段落、`##`〜`####` の見出し、強調、箇条書き、引用、コード、リンク、画像）と、次のもの。

| 書き方 | 書くこと |
|---|---|
| 節の id | 何も書かない：`npm run ids -- <作業フォルダ>` が、id のない `##` の見出しの前に `(sec-xxxxxx)=` の行を足す。手で書いたり変えたりしない |
| 数式 | `$x^2$`。別行は `$$ … $$`。名前を付けると番号が付く：`$$ … $$ (eq-loss)` |
| 図 | `:::{figure} images/tree.png` に `:label: fig-tree` と `:alt: 図の説明`。最初の段落が図の題、残りは注 |
| 小さな図を並べた図 | `::::{figure}` の中に `:::{figure} <パス>` を 2 つ以上（それぞれ `:alt:`） |
| 表 | パイプの表か、それを `:::{table} 題` と `:label: tbl-…`・`:class: …` で囲んだもの（`:class: horizontal` は縦書きの本でもその表を横組みにする。長い数や欧文の表に。`:class: row-headers` は本文の各行の最初のセルを行の見出し（`th scope="row"`。見出しの行と同じ見た目）にする。見出しの列のある表に。ほかの名前は英小文字・数字・`-` で、テーマに `egatari-table-<名前>` として渡る）。表の後の段落は注・出典。セルを結合するときは `:::{table}` の中に HTML の `<table>`（`table thead tbody tr th td`、`colspan rowspan align`、セルの中は `em strong code sub sup br` だけ。空行・数式・Markdown は書けない） |
| コラム | `:::{aside} 題`。`:label: box-…` と `:class: goals` を付けられる（種類の例：`goals`・`inquiry`・`tryit`・`point`・`summary`・`advanced`・`note`・`warning`） |
| 定理の類 | `:::{prf:theorem} 題` と `:label: thm-…`。`lemma`・`definition`・`example`・`remark`・`proof` など mystmd の種類。証明の終わりに ∎ が付く |
| 問と解答 | `:::{exercise} 題`（`:label: exr-…`、`:nonumber:`）。`:::{solution} exr-…` |
| 相互参照 | `[](#fig-tree)` は「図 1.1」「1.2 節」「式 (1.1)」になる。`[字](#名前)` は書いた字のまま |
| 引用 | `[@key]`・`[@key, p. 3]`・`[@a; @b]`、文の中なら `@key` |
| ステップへのリンク | ``{step}`s-k3f9q2:2` `` か ``{step}`この動きを見る <s-k3f9q2:2>` ``（スライドの id とステップ） |
| 脚注 | `字[^n]` と `[^n]: 注` の行（段落だけ） |
| ルビ | ``{ruby}`下人|げにん` `` |
| 下付き・上付き | ``H{sub}`2`O``、``m{sup}`2` `` |
| 定義の並び・用語集 | 用語の行の次に `: 説明`。用語集 `:::{glossary}` は本に 1 つ。本文では ``{term}`用語` `` |

名前（label）は読める名前を自分で付けます（`fig-…`・`tbl-…`・`eq-…`・`box-…`・`exr-…`・`thm-…`）。全部の章を通して 1 つずつで、スライドの id とも違うものにします。`sec-`・`s-`・`ref-`・`fn-`・`term-`・`egatari-` では始められません。

図・`:::{table}` の表・コラム・定理の類・問には、名前があってもなくても番号が付きます（mystmd と同じ）。式は名前を付けたときだけ、囲まないパイプの表には付きません。番号は章に従います：節 4.1、「図 4.1」、式 (4.1)。コラム・問・定理の種類ごとに別に数えます。章の番号がなければ本を通して数えます（1、1.1、図 1）。日本語の本では強調は斜体でなく傍点になり、縦書きでは 1〜2 桁の数字が縦中横になります（第3章・10月）。3.14・2026・12:30・A4 はまとめて横に寝かせます。

### 小さな図を並べた図

外の図は、中の図よりコロンを 1 つ多くします。外の図の `:label:` と題（中の図の後の段落）は図の全体のもの。中の小さな図は、それぞれ `:alt:` を書き、`:label:` と短い題を付けられます。

```markdown
::::{figure}
:label: fig-loss-pair

:::{figure} images/abs.svg
:label: fig-abs
:alt: 絶対値の損失は折れ線

絶対値
:::

:::{figure} images/square.svg
:alt: 二乗の損失は放物線

二乗
:::

2 つの損失。

架空のデータ。
::::
```

`[](#fig-loss-pair)` は「図 1.1」、`[](#fig-abs)` は「図 1.1(a)」になります。中の図の後の最初の段落が図の題、残りは注です。

## 書けないもの

HTML（上の表のほか）、ほかの指令と役割（`{note}` などの囲み、`{margin}`、`{list-table}`、`{numref}`、`{eq}`、`{cite:p}`、`{math}` など）、「\`\`\`」で囲んだ指令、`%` のコメント、`+++`、`{{ … }}`、取り消し線、チェックの付く箇条書き、リンクにしていない URL、`#` と `#####` の見出し。点検はそれぞれを行の番号と一緒に挙げ、代わりの書き方を言います（例：`{numref}`fig-a`` → `[](#fig-a)`、`{note}` → `:::{aside} 題`）。字としての `%`・`@` は `\%`・`\@` と書きます。

## 引用

`[@key]`・`[@key, p. 3]`・`[@a; @b]`、文の中なら `@key` と書きます。鍵は `references.json` の `id` です。組み立てが Citation Style Language（citeproc-js）で引用の字と文献の一覧を作ります。書式と一覧の置き場所は `egatari.json` に書きます。

```json
{ "metadata": { "citations": { "style": "ieee", "list": "chapter" } } }
```

| 項目 | 値 |
|---|---|
| `style` | `apa`（著者と年。既定）、`ieee`（番号）、`sist02`（番号。日本語。日本語の本では、巻・号・ページを SIST02 のとおり vol.・no.・p. と書き、題を「」で囲む。著者のない文献は編者を書く）。ほかの名前はそのまま残し、本は `apa` で組み、点検が警告する |
| `list` | `end`（終わりに 1 つ。既定）、`chapter`（章の終わりごと。`article/` の章のときだけ）、`none` |

所在（`p. 3`・`3 頁`）は書いたとおりに出ます。`references.json` のうち本文で引いていない文献は一覧に出ず、点検が警告します。

### 引用とライセンス

引用は [citeproc-js](https://github.com/Juris-M/citeproc-js) で組みます（CPAL-1.0 で使います）。動くのは手元で組み立てるときと `pack` のとき、それに文献を引く本を編集アプリが見せる・保存するときです（編集アプリは、そのときだけ手を加えていない citeproc のファイルを読み込みます）。教材と Egatari ファイルに入るのは組んだ字だけです。citeproc で引用を組んだとき、組み立てと `pack` は帰属の表示を出し、編集アプリは本の下に出します（英語のまま）。

> Citations formatted by citeproc-js — (c) Frank Bennett — citeproc-js implements the Citation Style Language — https://citationstyles.org/

`vendor/csl/` の書式と言語のファイルは Citation Style Language のもの（CC BY-SA 3.0）です。[NOTICE](../NOTICE) を見てください。

## スライドと節のつながり

スライドの `data-article` が節の id を挙げるか、節の中にそのスライドへの `{step}` のリンクがあると、スライドと節はつながっています。`data-article` には節の id を空白で区切っていくつも書けます（関わりの深い順）：`<section class="slide" id="s-k3f9q2" data-article="sec-h7q2xz sec-q7r2x5">`。最初のものがそのスライドの節で、**本で読む**はそこを開き、本はスライドに付いてそこへ動きます。`npm run ids -- <作業フォルダ>` は新しいつながりを `egatari.json` に記録します（`articleLinks`：節の字と、スライドと台本の hash）。後でどちらかが変わると、点検がその組について「スライドと本が合っていないかもしれません」と知らせます。字は自動では直しません。読み比べて直すところを直し、`npm run ids -- <作業フォルダ> --confirm-links` で、合っていることを記録し直します。

## Egatari ファイル

`npm run portable -- pack <作業フォルダ>`（と `node kit/build.mjs <deck.html> --portable`）は本を Egatari ファイルに入れます。章のファイル・`references.json`・本の画像が中に入り、組んだ本はファイルの読める文の最後（`#egatari-article`）に入るので、スクリプトなしでも読めます。誤りのある本は書き出しません。先に点検の挙げたものを直します。id のない節には id を付け、作業フォルダにも書き戻します。`unpack` は同じファイルと、`egatari.json` の読む順を出します。編集アプリは本を見せ、点検し、直し、印刷します（[編集アプリ](editor.ja.md#本下書き)）。本だけを直したときは本だけを組み直して Egatari ファイルを保存し、本のある作業フォルダも書き出せます。
