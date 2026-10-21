<!-- i18n: pair=reference.md sha256=2f45bf3a6a438d9b -->
# リファレンス

[English](reference.md) | 日本語

使える選択肢・記法・キーを、コードから拾って 1 行ずつ並べたもの。理由と厳密な規則（位置と時刻、タイムラインの式、注目の演出、モーフ）は [contract.ja.md](contract.ja.md)。手順の説明は [README](../README.ja.md)、[dev-server.ja.md](dev-server.ja.md)、[video.ja.md](video.ja.md)。

目次：[原稿の記法](#原稿の記法) · [口述原稿](#口述原稿narrationmd) · [長さ](#長さtimelinejson) · [テーマ](#テーマ) · [部品](#部品) · [発表](#発表) · [開発サーバー](#開発サーバー) · [品質チェック](#品質チェック) · [build](#build) · [TTS](#tts) · [書き出し](#書き出し) · [道具](#道具) · [環境変数](#環境変数)

## 原稿の記法

### 作業フォルダのファイル

| ファイル | 読むもの | 用途 |
|---|---|---|
| `deck.html` | build | スライド（名前は自由。雛形は `examples/minimal/deck.html`） |
| `narration.md` | build・TTS・書き出し | 段階ごとの口述原稿 |
| `timeline.json` | build | 段階の長さの例外 |
| `macros.tex` | build | KaTeX のマクロ（`\newcommand`、`\renewcommand`、`\def`。既定のマクロに足す） |
| `audio/manifest.json` | build | `tts/synth.py` と編集アプリの音声の板が書く（段階ごとに `file`・`dur`・`cues`・`sync`・`kind`・`inputHash`、TTS なら `recipe`。任意で `processing` と、鳴らし始める符号化の遅れ `startOffset`） |
| `voice.json` | TTS | 声・言語・エンジン |
| `figs/*.svg`、`data/*.json` | build | `{{FIG:…}}` / `{{JSON:…}}` の元 |
| `components/<名前>/index.js` | build | デッキ専用の部品（部品庫より先に探す） |
| `egatari.json` | build・1 ファイル | `docId`・metadata・添付の一覧。`components` は部品庫の部品の版の固定（`{"bars": "1.0.0"}`、format spec §3.3。1 ファイルの中の写しには書き出しが使った版が入り、展開でそれが書かれるので、組み直しで版が変わらない。固定がなければ `components.lock.json` の既定の版） |
| `themes/<名前>/` | build | デッキ専用のテーマ |
| `comments.json`、`.cache/edits/` | 開発サーバー | 開発サーバーが書く |
| `out/<名前>.html` | — | build の既定の出力 |

### スライドとクラス

| 書き方 | 意味 |
|---|---|
| `<div id="stage">` の中の `<section class="slide">` | 1 枚（1280×720）。`<h2>` 見出し、`<div class="body">` 本文、`<div class="concl"><span>…</span></div>` 結論の行 |
| `class="slide cover"` | 表紙。子要素は `.venue`（会場・授業の名前。top 120px）、`<h1>`（題名。top 200px。副題は `<br>` のあとの 2 行目に書くか（`<h1>題名<br>副題</h1>`）、`.venue` に入れる）、`.au`（著者・所属。top 450px。`<br>` で何行でも）で、テーマのロゴが左下に入る（`.logos`）。どれも絶対位置で、表紙には `.body` がない。ほかの要素（`<p class="sub">` など）は置き場所が決まらず、スライドの上端の帯に重なる。ほかの字は、デッキの `<style>` で `position:absolute` と `top` を決めて空いた場所に置く。字がスライドの外に出る・ほかの字や帯に重なると品質チェックが警告する（`textOffSlide`・`textOverlap`） |
| 表紙に `data-nologos` | この表紙にはロゴを入れない（表紙に `.logos` の要素が既にあるときも入れない） |
| `class="slide sec"` | 章の扉（`<h1>` は top 300px、`.lead` は top 390px。ほかの字は表紙と同じく自分で置く）。動画の `--full` の章の始まり |
| `class="slide sec appendix"` | 付録の扉。以降のページ番号は「付録」/ Appendix。`appendix` がなくても、文字に「付録」か Appendix を含む `sec` は付録の扉とみなす |
| `class="… static"` | 段階なし：全部見せる。`.concl` も別の段階にしない |
| `class="… nostep"` | 箇条書きを自動で段階にしない |
| `class="… noconcl"` | 結論の行なし：本文は 565px でなく 680px まで使える |
| `class="… layout-tate"` | 縦組みのスライド：見出しは右端の縦の列、本文はその左に縦書き、結論の行は左端の縦の列（[国語](#国語kokugo)） |
| section の `id="…"` | スライドの鍵（見出しより優先）。見出しが重なるときに付ける。[スライドの鍵](#スライドの鍵) |
| `data-morph` / `data-morph="鍵"` | 前のスライド / その鍵のスライドからモーフで入る（[contract §8](contract.ja.md#8-モーフdata-morph)） |
| `data-chapter="名前"` | ここから章を始める（`sec` と同じ扱い。章の名前を指定） |
| `data-steps="n"` | 段階の数の下限（旧形式の `data-anim` 用） |
| `data-anim="名前"` | 旧形式の動き：`DECK.ANIM[名前](slide, k, instant)` を呼ぶ。動画では各段階の最終状態だけになる。新しく書くなら部品にする |
| 直下の子に `<div class="pn">` | ページ番号を自分で書く（なければ 2 枚目から `i/N` が入る） |
| `<html lang="en">` | 英語のデッキ：本文は Source Sans 3、画面の言葉は英語、品質チェックは英語の規格、TTS は `voxcpm2` |
| `<html data-theme="名前">` | テーマ（`--theme` が優先） |
| `<html data-mode="lecture">` | URL に `?mode=` がないときのモード |
| `<html data-feedback-url="URL">` | 「フィードバックを送る」の宛先（既定 `https://github.com/egatari/egatari-studio/issues/new`）。GitHub の `/issues/new` なら `template=feedback.yml` を足す。`version` `browser` `os` `context`（言語・モード）を URL の引数として付ける |
| `<html data-feedback="off">` | `?` の一覧と発表者ビューにフィードバックのリンクを出さない（`DECK.FEEDBACK_URL = null`） |
| `<html data-font="mincho">` | 本文を BIZ UDP明朝にする（`--font-sans: var(--font-mincho)`）。[国語](#国語kokugo) |

本文のクラス（色はすべてテーマから）：`.sub` 小見出し · `.big` 主要な式 · `.note` 補足（27px） · `.thm` 定理の枠 · `.box` 淡色の枠 · `.cols` 横並び · `.arrow` 中央の矢印の行 · `.fig` / `.figcap` 図とキャプション · `.cite` 出典（20px） · `.plot` `DECK.Plot` の箱 · `.readout .num` 桁をそろえた数 · `td.r` 右寄せのセル · `.term`/`.blue`、`.emph`/`.red`、`.muted`/`.gray`、`.b` 色と太字 · `.tate` 縦書き · `.mincho` 明朝 · `.tcy` 縦中横 · `<ruby>` 振り仮名（[国語](#国語kokugo)）。

### 段階の属性

| 属性 | 意味 |
|---|---|
| `data-step="k"` | 段階 k（k ≥ 1）で現れる。段階 0 は入った直後に見えているもの |
| （スライドに何も書かない） | `data-step` も `data-from` もないスライドは、`.body > ul > li` と `.body > ol > li` が順に段階 1, 2, … になる |
| `.concl` | 常に最後の段階（`max + 1`）。段階の鍵は `concl` |
| `data-at="秒"` | その段階の中で、秒だけ遅れて始まる（フェードと `.draw`） |
| `class="draw"` | SVG の線を描いていく（`pathLength="1"` が要る）。段階はいちばん近い `data-step` の祖先、自分の `data-step`、なければ 0。0.7 秒 |
| `class="draw drawslow"` | 同じく 1.4 秒 |
| `data-from="k"`（部品） | 部品の段階 1 をスライドの段階 k に合わせる（既定 1） |
| `steps="n"`（部品） | 部品の段階の数を上書きする |
| `data-id="ID"` | モーフの対応（[contract §8](contract.ja.md#8-モーフdata-morph)） |
| `id="ID"` / `data-mark="ID"` | `{mark:ID}` の目印（[contract §7](contract.ja.md#7-注目の演出mark)） |
| `data-key`、`data-title` | build が付ける（スライドの鍵、タグなしの見出し）。`id` のない section に手で `data-key` を書けば、それを鍵に使う（旧来の書き方。品質チェックが警告する）。[スライドの鍵](#スライドの鍵) |

### 数式

| 書き方 | 意味 |
|---|---|
| `\( … \)` / `\[ … \]` | 文中 / 別行の式。build で KaTeX が組む（`<script>` `<style>` `<svg>` `<textarea>` とコメントの中は対象外） |
| `\hlE{…}` `\hlT{…}` `\hlM{…}` | 式の一部を結論（`--emph`）/ 用語（`--term`）/ 既知（`--muted`）の色に |
| `\morph{ID}{…}` | 式の中のモーフの対応（= `\htmlData{id=ID}{…}`） |
| `\htmlId{ID}{…}`、`\htmlData{mark=ID}{…}` | 式の中の注目の演出の目印 |
| `\htmlClass{名前}{…}` | 式の中に CSS のクラス。`\html…` はこの 3 つだけ許す |
| `macros.tex` | `\newcommand{\R}{\mathbb{R}}`、`\newcommand{\v}[1]{…}`、`\def\x{…}`。波括弧の入れ子は 3 段まで |
| `<script type="text/x-tex-macros">…</script>` | 同じ書き方のマクロを `deck.html` の中に |
| KaTeX のエラー | build が警告し、元の式を赤で出す（`.katex-error`）。品質チェックはエラーにする |
| 部品や原稿のスクリプトで `DECK.svgMath(…)` | 実行時にも KaTeX を埋め込む（マクロも同じ） |

### 埋め込み

| 書き方 | 意味 |
|---|---|
| `/*INCLUDE:ファイル*/` | ファイルの中身をそのまま入れる（作業フォルダ → `kit/` の順に探す）。そのフォルダの外を指すもの（`../`、絶対パス、シンボリックリンク）は警告して読まず、空にする |
| `{{FIG:名前}}` | `figs/名前.svg`（なければ作業フォルダの `名前.svg`）を埋め込む。id に `名前-` を前置し、width・height を外す |
| `{{JSON:ファイル}}` | `data/`（なければ作業フォルダ）の JSON を詰めて入れる。部品の子の `<script type="application/json">` に置くと `this.data` で読める |
| `<m-名前 …>` | 部品。デッキの `components/名前/index.js`、なければ部品庫の写し `vendor/components/名前/<版>/index.js` を自動で読み込む |

`{{FIG:…}}`・`{{JSON:…}}`・`narration.md`・`timeline.json`・`macros.tex`・`audio/manifest.json` の中のファイルも、（シンボリックリンクをたどった先が）作業フォルダの中にあるときだけ読む。外なら警告（`refused: …`）して飛ばす。

### 素材（build で埋め込む）

| 参照 | 埋め込み方 |
|---|---|
| `<img src>`、`<source src/srcset>`、`<img srcset>`、`<video src/poster>`、`<audio src>`、`<track src>`、SVG の `<image href>` | `data:` URI |
| 原稿の `<style>` と `style=""` の中の `url(…)`・`@import` | `data:` URI／取り込む CSS の中身（リンクや @import した CSS の中の `url()` はその CSS からの相対） |
| `<link rel="stylesheet" href="file.css">` | 中身を入れた `<style>` |
| `<link rel="icon">` などほかの `<link>` のファイル、`<script src="file.js">` | `data:` URI／中身を入れた `<script>` |

相対パスは作業フォルダから解決し、フォルダの外は読まない。`data:`・`blob:`・`#断片`・テンプレートの値（`${…}`、`{{…}}`）はそのまま。警告：`missing: …`（ファイルがない）、`refused: …`（作業フォルダの外）、`external: …`（素材の位置にある `http(s)` の参照。`<iframe>`・`<object>` を含む。そのまま残すので、オフラインでは出ない）。ふつうのリンク（`<a href>`）は触らない。`audio/manifest.json` の音声は `--embed-audio` のときだけ埋め込む。

### スライドの鍵

スライドごとに鍵を 1 つ付ける（[約束事 §4](contract.ja.md#4-口述原稿narrationmd)）：section の `id`、なければ手で書いた `data-key`、なければ見出しの正規化（タグを除き、`&nbsp;` を空白とみなし、空白をすべて除く）、なければ `s<番号>`。どのスライドにも id を付ける（`npm run new` は付ける。今あるデッキには `npm run ids -- <デッキ>`）。id は `^[A-Za-z][A-Za-z0-9_-]{0,63}$` に合うもので、デッキのほかのどの id（目印・`\htmlId{…}` も）とも重ねない。鍵が重なるデッキは正しくない（品質チェックのエラー）。それでも組めるように、build は警告（`slide key: …`）し、後のスライドに `#2`、`#3`、… を付ける。決まった鍵は section の `data-key` に書く。

## 口述原稿（narration.md）

| 書き方 | 意味 |
|---|---|
| `## 見出し {#s-k3f9q2}` | その id のスライド（勧める書き方。id が見出しの文字列より強い） |
| `## s-k3f9q2` | その id のスライド |
| `## 見出し` | 旧い書き方（id のないスライド）：見出しの文字列からタグと空白を除いたもの |
| `[0]` `[1]` … `[concl]` | その段階の原稿。続く行は同じ段階。段階は 0〜999 で先頭の 0 なし（`[01]` は段階にならない） |
| `@x-<名前>-<欄> <値>` | 段階の中の拡張の行：その段階のデータとして残す。表示も読み上げもせず、hash にも入らない |
| `Expert:` / `Novice:`（`E:` / `N:`、全角のコロンも可） | 話者の発言。話者のない行は Expert（1 人モード）か、前の発言の続き |
| `{cue}` | 段階の中の同期点。部品の `cues(k)` と順に対応 |
| `{mark:ID}` | この言葉で目印に下線を引く |
| `{mark:ID\|効果}` | 効果：`underline`、`circle`、`box`、`spot`、`laser` |
| `{mark:ID\|効果\|hold=2}` | 2 秒で消す（既定は段階の終わりまで。`laser` は 1.5 秒） |
| `{mark:clear}` | その時点で、その段階の印をすべて消す |
| `{φ\|ファイ}` | 表示は φ、読みはファイ |
| `# 題名` | 無視する |
| `<!-- … -->` | 行全体のコメント（複数行も可）。無視する |
| 同じ段階を 2 回書く | 後のものが効く |

build は、どのスライドにも合わない `##`（品質チェックではエラー）、決まった書き方でない段階の番号、規則に合わない `{#id}`、無い効果の名前、原稿に無い目印を警告する。

## 長さ（timeline.json）

`dur = override.dur ?? max(anim, 音声 ? lead + 音声 + pad_after : max(hold, 印の終わり + pad_after))`（[contract §5](contract.ja.md#5-タイムライン)）。

| `"スライドの鍵:段階"` の中の鍵 | 既定 | 意味 |
|---|---|---|
| `dur` | — | 長さを固定（秒）。`lead + dur` を超えた音声は切る |
| `hold` | 1.2 | 音声のない段階の長さ |
| `lead` | 音声があれば 0.25、なければ 0 | 音声の前の無音 |
| `pad_after` | 0.6 | 音声（か最後の印）の後の間 |

例：`{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`。直したら build し直す。

組み込みの長さ（`DECK.T`、秒）：フェード 0.45、線 0.7、ゆっくりの線 1.4、線の遅れ 0.1、スライドの切り替え 0.35、モーフ 0.9。注目の演出（`DECK.MK`）：描く 0.5、消える 0.3、音声がないときの間隔 0.9、レーザー 1.5。`prefers-reduced-motion` のとき（`?mode=video` を除く）は、どの段階も最終状態で見せる。

## テーマ

決め方：`--theme` > `<html data-theme>` > `default`。名前は、作業フォルダからの相対パス → `<deck>/themes/<名前>/` → 自分のテーマのフォルダ（`EGATARI_THEMES` のフォルダを順に、その後に `~/.egatari/themes` があれば）→ 同梱の `themes/<名前>/` の順に探す。フォルダには `tokens.css` が要る。`EGATARI_THEMES` はフォルダの並びで、区切りは OS のもの（`:`、Windows は `;`）。ないフォルダは警告して飛ばす。`theme.json`・`tokens.css`・ロゴ・親のテーマ（`extends`、何段でも）は、読む前に、実体のパスがそのテーマの許した根の中にあることを確かめる：原稿のテーマなら作業フォルダ、部品庫のテーマなら `themes/`、自分のテーマのフォルダのテーマならそのフォルダ（実体のパスを 1 回だけ求める。`~/.egatari/themes` はシンボリックリンクでもよい）、`--theme` で選んだものならそのテーマのフォルダ。親は自分のテーマのフォルダと `themes/` からも取れる。`"extends": "default"` は、テーマのフォルダに自前の `default` がなければ同梱の `default`。外なら警告（`refused: …`）して読まず、原稿のテーマなら `default` にする（[format spec](https://github.com/egatari/egatari-spec) §11）。原稿（か `extends`）が選んだテーマがどこにもなければ誤りにせず、`theme not found: "<名前>" …` と警告して `default`（親はなし）で組む。`--theme` で選んで見つからないものは誤り。編集アプリは `EGATARI_THEMES`・`~/.egatari/themes` を見ない：そこではテーマのフォルダを 1 つ選び（「テーマのフォルダを選ぶ…」。読むだけ）、それが同じ順と同じ決まりで自分のテーマのフォルダの代わりになる（[編集アプリ](editor.ja.md)）。選ばず、原稿の `themes/` にもなければ、テーマが自分のテーマのフォルダにだけあるデッキはこの警告を出す。1 ファイル（`.ega.html`）は、自分のテーマのフォルダのテーマを原稿の `themes/<名前>/` として入れるので、どこでも同じテーマで組み直せる。`extends` が 16 段より深ければ誤り。

| `theme.json` の項目 | 意味 |
|---|---|
| `extends` | 親のテーマ：その `tokens.css` を先に置く（このテーマの隣 → 自分のテーマのフォルダ → `themes/` の順に探す） |
| `logos` | 画像のファイル（テーマのフォルダから。png・jpg・svg・webp）。すべての表紙に入る。書かなければ `extends` の親のロゴを引き継ぐ（`"logos": []` で消す） |
| `name` | 説明用 |

| 変数 | 意味 |
|---|---|
| `--base` | 基調色。ほかの色は `themes/default/tokens.css` でここから導く |
| `--emph-hue` | `--emph` の色相（既定 27、赤） |
| `--fg` `--bg` `--title` `--term` `--emph` `--muted` `--line` `--rule` | 文字・背景・見出し・用語・結論・既知・細い線・見出しの下線 |
| `--complement` `--accent2` `--base-tint` `--base-wash` `--comp-tint` `--term-tint` `--emph-tint` | 導かれる色と淡色（`--term-tint` は `.thm`、`--base-wash` は `.box`、`--emph-tint` は授業モードの強調） |
| `--series-1` … `--series-4` | 図の系列の色 |
| `--font-sans`、`--weight-body` | 字の種類、本文の太さ |
| `--cover-bg`、`--logo-h` | 表紙の背景、ロゴの高さ（128px） |
| `--sec-bg`、`--sec-fg` | 扉の背景（`--base`）と文字（白） |
| `--concl-bg` | 結論の行の背景（透明） |
| `--stage-bg` | スライドのまわりと暗転の色（#2f2f2f） |
| `--cap-size`、`--cap-bottom`、`--cap-side`、`--cap-max-lines` | 字幕の字の大きさ（27px）、下端からの距離（18px）、左右の余白（96px）、1 まとまりの行数の上限（3） |
| `--cap-rate` | 手で送るときの字幕の読む速さ（字/秒。既定 ja 7、en 15。`DECK.captionRate` でも変えられる） |

字：日本語のデッキ（`lang` が `ja` か、ない）は BIZ UDPゴシックを埋め込む。ほかの言語は Source Sans 3 を埋め込み、U+024F より後ろの字だけを BIZ UDPゴシックで補う。埋め込むのは使っている字を含む分割ファイルだけ（`fonts/*.ttf` と uv があれば使っている字だけ）。BIZ UDP明朝は、デッキが明朝を使うときだけ、同じ字を埋め込む：デッキ・テーマ・使っている部品のどれかに `var(--font-mincho)` がある、`class="mincho"`、`<html data-font="mincho">`（`kit/layouts.css` の `--font-mincho` の定義は数えない）。`--font-mincho` は `:where(:root)` で決めてあるので、テーマで上書きできる。テーマ `kokugo`：本文は明朝、基調色は藍、強調は朱、地は生成り、字幕は BIZ UDPゴシック（`--font-cap`）。

| 変数 | 意味 |
|---|---|
| `--font-mincho` | 明朝の字（`"BIZ UDPMincho", "Hiragino Mincho ProN", "Yu Mincho", serif`） |
| `--font-cap` | 字幕の字（既定は `--font-sans`） |

## 部品

部品の一覧と受け取る値は [vendor/components/CATALOG.md](../vendor/components/CATALOG.md)（既定の版の各 README の frontmatter から `node tools/catalog.mjs` が作る）。部品は [egatari/components](https://github.com/egatari/components) のもの：Studio はそのリリースの写しを `vendor/components/<名前>/<版>/` に持ち、`components.lock.json` で固定する。`npm run components:update -- vX.Y.Z` でリリースを取り込み（ネットワークを使うのはこれだけ。tarball をリリースの `manifest.json` と照らし、取り込んだ版はすべて残す）、`npm run components:check` で写しと固定を照らす（npm test に入っている）。新しい部品の提案は [egatari/components の Issue](https://github.com/egatari/components/issues/new?template=proposal.yml) へ。部品の書き方（`DECK.define`、`DECK.MotionElement`、`static steps`、`static props` の `type: number | bool | json | string`、`mount`、`duration`、`cues`、`render`）は [contract §3](contract.ja.md#3-部品web-components) と [skills/motion-components](../skills/motion-components/SKILL.md)。

部品が使える `DECK` の道具：`el(tag, attrs, parent)`（SVG。`var()` の色は `style` に回す）、`mtext(parent, x, y, "*x*_0", attrs)`、`svgMath(parent, x, y, tex, {size, anchor, color, w, h})`、`Plot(box, {xr, yr, xt, yt, xf, yf, xl, xl2, yl, noY, m})`（`.x() .y() .d(f, a, b, n) .poly(pts) .clip`）、`prog(t, start, dur)`、`lerp`、`ease`、`clamp01`、`color(名前)`。

**スライドへのリンクと目次。** `<a href="#<スライドの id>">` と `<a href="#<スライドの id>:<段階の鍵>">` は、スライドかその段階へのふつうのリンク（スクリプトなし。Core の文書に入れてよい）。実行系は文書の中でたどり、「戻る」を出す（[contract §9](contract.ja.md#9-スライドへのリンク)）。id は `npm run ids` が付けたものを使う。**`m-menu`** はそのリンクを札の格子に並べる（題・副題 `data-sub`・丸の字 `data-icon`・このセッションで見たスライドの「見た」の印・`per-step` で段階ごとに出す）：[vendor/components/menu/1.0.2/README.md](../vendor/components/menu/1.0.2/README.md)。見本は [`examples/kokugo-kanbun`](../examples/kokugo-kanbun) の 2 枚目。スライドの中のリンクは `--term` の色で下線を引く。

### 国語（kokugo）

国語（漢文・古文・現代文）の授業のためのもの。見本は [`examples/kokugo-kanbun`](../examples/kokugo-kanbun)（テーマ `kokugo`）。

- **縦書き**：`.body` の中の `<div class="tate">…</div>` は `writing-mode: vertical-rl` で、本文の高さいっぱいに右から左へ列を並べる（段落の間は左に空ける。`p.indent` で字下げ）。`.tcy` は 2 桁の数字などを縦中横にする
- **縦組みのスライド**：`<section class="slide layout-tate">` はスライド全体を縦に組む。`<h2>` は右端の縦の 1 列（1166〜1232px、天 48px から天付き）で、テーマの見出しの下線は列の左の縦の罫になる。列は折り返さない（全角でおよそ 14 字。長いと品質チェックが指摘する）。`.body`（148〜1138px、48〜664px。`noconcl` なら左は 48px から）は `writing-mode: vertical-rl` で、段落と箇条書きは右から左へ列を進め、`.tate` の塊は本文いっぱいに組む。本文の中の部品・図・表（`p`・`ul`・`ol`・`.sub`・`.note`・`.arrow`・`.tate`・`.box`・`.thm`・`h3`・`blockquote` 以外の直下の要素）は、自分の箱を測って描くので横組みのまま本文の幅いっぱいに置く。縦書きは部品の指定で（`m-kobun tate`・`m-gendai tate`。`m-kanbun` はいつも縦書き）。`.concl` は左端の縦の列（48〜120px。およそ 19 字）。ページ番号は右下のまま（見出しの列の下）。変わるのは CSS だけで、スライドの鍵・字幕・1 ファイルの読める層は、これまでどおり見出しの字から作る。見本は [`examples/kokugo-kanbun`](../examples/kokugo-kanbun) の現代文のスライド、試験は `tools/test-layout-tate.mjs`
- **ルビ**：`<ruby>漢<rt>かん</rt></ruby>`。`rt` は 0.5em で、品質チェックは字の大きさを数えない。縦書きでは右に付く
- **明朝**：`.mincho`、`<html data-font="mincho">`、または `--font-sans: var(--font-mincho)` にするテーマ（`kokugo`）
- **`m-kanbun`**：縦書きの漢文。1 行が 1 列。字の後ろに `(送り仮名)`、`[返り点]`（`レ`・`一二三四五`・`上中下`・`甲乙丙丁`・`天地人`・`一レ`・`上レ` など。`レ` だけは括弧なしでもよい）、`{振り仮名}`、`{=かな}`（書き下し文で平仮名にする字。`不{=ず}`）、`{-}`（置き字。読まない）、`(右|二度目)`（再読文字。`未(ダ|ず)`）、`-`（竪点）、`、` `。`。段階：白文 → `kunten`（返り点は左下、送り仮名は右下）→ `order`（訓読の順に字を照らし、上へ戻るところに弧。`cues(k)` は各列の読み始め）→ `kaki`（書き下し文を左に）。規則と詳しいことは [vendor/components/kanbun/1.0.2/README.md](../vendor/components/kanbun/1.0.2/README.md)
- **`m-kobun`**：古文を語に切り（`春[名]/は[係助]/…`）、品詞で色を分けて 1 文ずつ出し、最後の段階で現代語訳（`= …` の行）を並べる。助動詞 `[助動・基本形・意味・活用形]` を押す（または Enter）と、部品の中の表から活用表と意味の札を出す（ネットワークを使わない。中身は文字だけ）。札は発表の操作で `DECK.seek(i, k, t)` の外：段階が動くと閉じ、動画のモードでは開かず、印刷に出ない。[vendor/components/kobun/1.0.2/README.md](../vendor/components/kobun/1.0.2/README.md)
- **`m-gendai`**：現代文。`__傍線__`、`==二重傍線==`、`{語句|_A,#名前}` と `{これ|>名前}`（指示語から指す先への矢印）、段落の `@主張#p3`・`@具体例#p1>p3`・`@対比#p2~p1` を役割の枠で囲み線でつなぐ。横書きか `tate`。[vendor/components/gendai/1.0.2/README.md](../vendor/components/gendai/1.0.2/README.md)

## 発表

### URL の引数

| 引数 | 意味 |
|---|---|
| `?mode=talk` | 既定：後の段階は隠し、今の段階はフェードで出す |
| `?mode=lecture` | 全部見せ、後の段階は薄く（0.28）、今の段階を強調（`.cur`）。印は最終状態 |
| `?mode=video` | 書き出し用：道具と操作の帯を出さない。reduced-motion を無視する |
| `?captions=1` | 字幕を出して開く（`s` と同じ）。`?mode=video` では字幕はこれでだけ出る（書き出しで字幕を焼き込める） |
| `?capsize=s` / `m` / `l` | 字幕の大きさ（22 / 27 / 34px）。覚えた大きさより優先。`?mode=video` では効かない |
| `?presenter=1` | 発表者ビュー（`p` で開く） |
| `?view=follow` / `?view=next` | 内部用：発表者ビューの中の画面 |
| `#N` | N 枚目（1 始まり）で開く。移動すると書き換わる |
| `#<スライドの id>` / `#<スライドの id>:<段階の鍵>` | そのスライド（段階 0）か段階（`0`・`1`・… か `concl`）の最終状態で開く（[contract §9](contract.ja.md#9-スライドへのリンク)） |
| `?embed=1` | iframe の中で：段階が変わるたびに親へ `{egatari:"position", slideKey, stepKey, t, cause}` を送り、親からの `{egatari:"links", follow}` を聞く |
| `?links=0` | `?embed=1` と一緒に：スライドへのリンクで動かず、代わりに `{egatari:"linkRefused", slideKey, stepKey}` を送る |

### キー

| キー | すること |
|---|---|
| → ↓ Space PageDown | 次の段階 |
| ← ↑ PageUp | 前の段階（最終状態で見せる） |
| Shift+→ / Shift+↓、Shift+← / Shift+↑ | 次 / 前のスライド（段階 0） |
| Home / End | 最初 / 最後のスライド |
| 数字＋Enter | そのページへ |
| f | 全画面 |
| p | 発表者ビュー |
| a | 今の段階から自動再生（音声があれば流す）。移動のキーで止まる |
| l | 授業モードの入り切り |
| b | 暗転の入り切り |
| s | 字幕の入り切り：今の段階の口述原稿（表示用の文字）をスライドの下に出す |
| Shift+s | 字幕の大きさ：S → M → L（22 / 27 / 34px）。上に短く知らせ、最後に選んだ大きさを覚える（localStorage） |
| o | 一覧（矢印・Home/End で選び、Enter・Space・クリックで移る。Esc か o で閉じる） |
| x | レーザー（マウスが 2 秒止まると消える） |
| d | ペン（筆圧に対応。線はスライドごとに残る） |
| v | 消えるペン（書き終えて 0.7 秒後から 0.5 秒で消える） |
| Shift+d | ペンの色：`--emph` → `--term` → `--fg`（赤・青・黒）。上に「ペンの色：青」と短く知らせる |
| Backspace / Shift+Backspace | ペンか消えるペンを使っている間：このスライド / 全スライドの書き込みを消す |
| Backspace / Alt+← | それ以外で、スライドへのリンクで来た後：リンクを押した位置へ戻る（左上の **戻る** ボタンとブラウザの戻るも同じ） |
| Tab / Shift+Tab | 操作の帯のボタンを選ぶ（Enter / Space で押す。Esc でスライドに戻る） |
| Esc | 道具を解除、キーの一覧を閉じる |
| ? | キーの一覧（`server/dev.mjs` で開いたときは開発サーバーのキーも） |

### 操作の帯（マウスを動かすと出て、2.5 秒で隠れる）

ボタン：前へ、次へ、自動再生・停止、レーザー、ペン、消えるペン（ペンの 2 つは右上の点が今の色。ペンの間は後ろに赤・青・黒の色のボタンが出て、押すとその色になる。選んでいる色は aria-pressed）、書き込みを消す（道具によらずこのスライド）、一覧、授業モード、字幕、発表者ビュー、全画面、キーの一覧、どこかの段階の音声が TTS なら小さな札「AI 音声」（format spec §7.3）。Tab で帯に入れ（フォーカスがある間は隠れない）、Enter / Space で押すとフォーカスはそのボタンに残り、Esc でスライドに戻る。マウスで押したときはフォーカスを残さない。スライドの下に 44px 以上の余白があれば余白に、なければ下端に重ね、そのときはマウスが下のほうに来たときだけ出す。印刷と動画には出ない。

`?` の一覧の下に「フィードバックを送る」のリンクと版（例：`v0.2.0`）がある。版・ブラウザ・OS・デッキの言語・モードだけを入れたフィードバックの form を開く。デッキの中身は送らない。動画・印刷・`data-feedback="off"` のときは出ない。

### 字幕

`s`・CC のボタン・`?captions=1` で、今の段階の口述原稿（`narration.md` の表示用の文字。読みと `{mark}` は除く）をスライドの下端の帯に出す。地は `--fg`、文字は `--bg`（品質チェックがこの 2 色のコントラスト 4.5:1 以上を見ている）。段階を文のまとまり（2 行ほど。字が大きいほど短い。長すぎる文は読点や語の切れ目で分ける）に分け、1 つずつ出す。1 まとまりは `--cap-max-lines` 行（3）までで、超えたら後ろの行を見せる。手で送っている間（と音声のない自動再生）は、読む速さ（ja 7 字/秒、en 15 字/秒。`--cap-rate` か `DECK.captionRate`）で次のまとまりに進め、段階が変わると最初から、最後のまとまりはそのまま残す。音声つきの自動再生と `?mode=video&captions=1` では、字数に比例して音声の時間を割り振って順に出す（動画で音声がなければ全部を出す）。大きさは `Shift+s`・`?capsize=`・テーマの `--cap-size` で変える。動画では `(i, k, t)` だけで決まる。操作の帯をスライドの下端に重ねるときは、帯が出ている間だけ字幕を帯の上へ上げ、隠れると戻す。印刷には出さない。`render/render.mjs` は字幕なしの `?mode=video` で開くので、焼き込むならそこに引数を足す。

### 読み上げとキーボード（アクセシビリティ）

`?mode=video` と発表者ビューの中の画面では足さない。どれも画素は変えない。

- 読み上げソフト：画面に出ない `aria-live="polite"` の領域（`#deck-live`）が、スライドが変わると「スライド n / N：タイトル」、次の段階では新しく出た段階の文字（式は KaTeX の字から）、戻ったときや文字の無い段階では「段階 k / K」を知らせる。スライドは `role="group"`・`aria-roledescription="スライド"`・`aria-label` を持ち、隠れたスライドは `aria-hidden="true"` と `inert`。発表ではまだ出ていない段階も `aria-hidden`（授業モードでは読める）。
- キーボード：操作の帯と発表者ビューのボタンは `aria-label`（`<html lang>` に従って日本語か英語）、切り替えのボタンは `aria-pressed` を持ち、フォーカスの枠は `:focus-visible` のときだけ出す。一覧は `dialog` で、縮図は名前つきのボタン。矢印で選ぶとフォーカスも動き、Esc で閉じると元のフォーカスに戻る。キーの一覧（`?`）も `dialog` で、開くとフォーカスが入り、閉じると戻る。書き込みの面は `aria-hidden` でフォーカスを取らないので、描いている間も Tab と Esc が効く。
- `prefers-reduced-motion` では各段階を最終状態で見せる（動画を除く）。
- 品質チェックは `alt` の無い `<img>`（飾りなら `alt=""`）と、`aria-label` / `aria-labelledby` / `<title>` の無い SVG の図を警告し、名前の無い部品を情報として挙げる。

### 発表者ビュー

今の画面（左）、次の段階（右上）、今と次の段階の口述原稿（右下。Novice の発言には印）、スライドと段階の番号、自動再生のボタン、道具のボタン（レーザー・ペン・消えるペン・消す・一覧・授業モード。ペンの間は本体と同じ赤・青・黒の色のボタン。本体とは色の番号でやり取りするので食い違わない）、経過時間と戻すボタン（⟲）、時刻。発表者ビューで効くキー：→ ↓ Space PageDown / ← ↑ PageUp、a、x、d、v、Shift+d、Backspace、Esc、o、l。左の画面に描いた線は本体に出る。`postMessage` でやり取りするので `file://` でも動く。キーの行の右端に「フィードバックを送る」のリンク（`?` の一覧と同じ）。

### 印刷と PDF

印刷（`tools/pdf.mjs` かブラウザ）では、各スライドを最終状態で 1 ページ（1280×720）ずつ出す。印・書き込み・道具・進み具合の帯は出さない。

### 実行時の API（スクリプトと品質チェック用）

`DECK.seek(i, k, t, from)`、`go(i, k, animate)`、`next()`、`prev()`、`state()` → `{slide, step, max, key, mode}`、`timeline()`、`autoplay(on)`、`stepKey(i, k)`、`marks(i, k)`、`morph(i)`、`slides`、`mode`、`ready`、`NARRATION`、`AUDIO`、`MARKS`、`TIMING`、`VERSION`（`package.json` の `version`。build が埋め込む）、`FEEDBACK_URL`（または `null`）、`feedbackUrl()`（欄を埋めた form の URL。または `null`）、`tools.{mode, setMode, clear, help, overview, color}`（`color()` はペンの色の番号 0〜2、`color(n)` で変える）、`captions(on)`（引数なしなら入か切か）、`captionSize(z)`（`"s"` / `"m"` / `"l"`。引数なしなら今の大きさ、動画では `null`）、`captionRate`（字/秒）、`toast(msg)`（短い知らせ）、`caption()`（出ている字幕の文字。無ければ `null`）、`announce()`（aria-live の領域の文字）、`resolveFragment(f)`（→ `{i, k, key, id}` か `{error}`）、`fragment(i, k)`、`follow(f)`、`back()`、`links()`（→ `{depth, follow, back}`）、`visited(i | 鍵)`（[contract §9](contract.ja.md#9-スライドへのリンク)）。`document` のイベントには `deck:captions`（`detail = {on}`）、`deck:tool`（`detail = {mode}`：`"laser"`・`"pen"`・`"vpen"` か `null`。発表の道具が変わったとき）、`deck:edit`（`detail = {on}`。開発サーバーと編集アプリのプレビューだけが、編集モードが変わったときに送る。実行系は発表の道具を切る。[開発サーバー](dev-server.ja.md)）もある。`document` のイベント：`deck:ready`、`deck:pos`（`detail = {i, k, max, n, key, nextKey, auto, cause, back}`。`cause` は `control`・`link`・`seek`・`play`、`back` は「戻る」の戻り先のスライドの見出しか `null`）。

## 開発サーバー

`node server/dev.mjs <deck.html> [--port 8730] [--theme 名前]`（`npm run dev -- …` でも）。詳しくは [dev-server.ja.md](dev-server.ja.md)。

| 項目 | ふるまい |
|---|---|
| `--port n` | 既定 8730。使われていれば次の番号を順に試す（20 回まで）。`--port 0` は空いている番号 |
| `--theme 名前` | build と同じ |
| 待ち受け | 127.0.0.1 だけ |
| 組み直すきっかけ | 原稿、`narration.md`、`timeline.json`、`macros.tex`、`audio/manifest.json`、`data/`、`figs/`、`components/`、リポジトリの `kit/`、`vendor/components/`、`themes/`、自分のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）。同じスライド・段階のまま読み込み直す |
| 開発用の build | 字を絞らない（速い）、直せる要素に `data-src`、音声は `/deck/audio/…`、組み立ての失敗は画面に出す |
| `e` | 編集モード。`h1 h2 p li td th`、`.big .note .sub .venue .au .thm .box .lead`、`.concl` の中の `span` をダブルクリック。⌘/Ctrl+Enter で保存、Esc で取消。build の警告の数を札に出す |
| `n` | 今の段階の口述原稿の引き出し（次の段階も表示） |
| `c` | 指示の一覧。クリックでそのスライドへ、「解決」で閉じる |
| Alt+クリック（Mac は ⌥ option+クリック） | AI へのメモを残す（`comments.json`） |
| `m`（編集モード） | 手書きメモ：丸や矢印を描いてからメモを書く。印は `stroke` として残る（[約束事 §12](contract.ja.md#12-レビューのメモ手書きの印)） |
| 衝突 | 開いた後に原稿が変わっていれば保存しない |
| 書き換えるファイル | `deck.html`（直した要素だけ）、`narration.md`（その段階だけ）、`comments.json`、`.cache/edits/`（新しい 30 個） |
| 口 | `GET /`（外枠。`?presenter=1` は発表者ビューの窓）、`GET /preview`（デッキの文書。sandbox の中で開く。iframe に入れてよい唯一の口。外枠の `cap` と `Sec-Fetch-Dest: iframe` がそろったときだけ出し、ほかは 403 の文字のページ）、`/deck/<ファイル>`（動かない形：CSP の `sandbox`、音声・画像など以外は `text/plain` の attachment）、`/__dev/shell.js`、`/__dev/editor-ui.js`、`/__dev/presenter.js`、`/__dev/events`（SSE）、`GET /__dev/info`、`GET /__dev/source?range=a-b`、`POST /__dev/edit`、`GET`/`POST /__dev/narration`、`GET /__dev/comments`、`POST /__dev/comment`、`POST /__dev/comment/resolve` |

## 品質チェック

Egatari の品質管理は、**規格**（[書き方の指示](authoring-with-llms.ja.md)の `R-fit`・`R-steps` など）、それに照らして**指摘**を出す**品質チェック**、指摘を AI に渡す**修正依頼**からなる。品質チェックにはコマンド版（`npm run check`。下。すべての項目）とブラウザ版（[編集アプリ](editor.ja.md)。一部の項目）がある。

`node kit/check.mjs <deck.html> [--theme 名前] [--lang ja|en] [--json]`。メモリ上で build し、ヘッドレス Chrome で開いて、スライドごとに結果を出す。エラーがなければ終了コード 0、エラーが 1 つでもあれば 1、ヘッドレスのブラウザが起動できないか途中で落ちて検査が終わらなかったときは 2（理由は stderr だけ。`--json` では `{"ok": false, "status": "crashed", "counts": {…すべて 0}, "results": []}` で、「エラー 0」とは見分けがつき、指摘にもならない）。`--theme` で別のテーマで確かめられる（なければ `<html data-theme>`）。エラーと警告の指摘は、どこか（スライドの番号・見出し・id・段階）、何が違うか、どう直すかを言い、[書き方の指示](authoring-with-llms.ja.md)の規格があればその名前（`（R-title）` など）を添える。そのまま修正依頼に貼れる。`--lang` は指摘の言語（既定はデッキの `<html lang>`。`ja` かなければ日本語、ほかは英語）。

`--json` の形：

```json
{"ok": false, "lang": "ja", "counts": {"error": 1, "warn": 0, "info": 12},
 "results": [{"slide": 2, "id": "s-k3f9q2", "key": "s-k3f9q2", "title": "減衰の式", "step": "3",
              "sev": "error", "code": "narrOrphan", "rule": "R-narr-steps", "data": {…},
              "msg": "スライド 2「減衰の式」（s-k3f9q2）、段階 3：口述原稿の [3] に当たる段階がスライドにない……（R-narr-steps）"}]}
```

`status` が `crashed`（終了コード 2）の結果は無効：検査が終わっていないので、`results` が空でも合格ではない。ふつうの結果に `status` の欄はない。スクリプトは終了コード 2 と `status: "crashed"` を失敗として扱う（`kit/core/check-result.mjs` の `parseCheck` がそうする）。

| 欄 | 意味 |
|---|---|
| `slide` | スライドの番号（1 から）。デッキ全体なら `null` |
| `id` | スライドの `id`。なければ `null`（id のないスライド・デッキ全体） |
| `key` | スライドの鍵（id、なければ見出しから決めた旧来の鍵） |
| `title` | スライドの見出しの字（`h2` / `h1`、タグなし） |
| `step` | その結果の段階：`"0"`・`"1"`・… か `"concl"`。スライド全体のことなら `null` |
| `sev` | `error`・`warn`・`info` |
| `code` | 結果の種類（変えない名前。一覧は `kit/check-messages.mjs`） |
| `rule` | 書き方の指示の規格の名前（`R-title`・`R-fit` など）。なければ `null` |
| `data` | その結果の値（本文のはみ出しなら `{"px": 583, "lim": 565, "concl": true}` など）。修正依頼が削る量を言うのに使う |
| `msg` | `lang` の指摘の全体：どこか・何が違うか・どう直すか |

| 品質チェック | 重さ |
|---|---|
| build の警告。どのスライドにも合わない口述原稿の `##`、決まった書き方でない段階の番号（`[01]`）、規則に合わない `{#id}` | 警告。エラー |
| `^[A-Za-z][A-Za-z0-9_-]{0,63}$` に合わないスライドの id（`slide id: …`）。鍵が同じスライドが 2 枚（`slide key: …`）。デッキのほかの id や `\htmlId{…}` と同じスライドの id（`slide id: …`） | エラー |
| `## 見出し {#id}` の見出しの文字列が、そのスライドの見出しと違う（id が勝つ） | 情報 |
| 旧来の規則で鍵が決まるスライド：手で書いた `data-key`、または `s<番号>`（id も見出しもない）—`slide key: legacy` | 警告 |
| スライドへのリンク（`#<id>`・`#<id>:<段階の鍵>`・`#N`）で、行き先のスライドがない・段階が範囲の外・結論のないスライドへの `:concl`。`#N` のリンクと id のないスライドへのリンク。ない相手のファイルへの相対リンク（[contract §9](contract.ja.md#9-スライドへのリンク)） | エラー。警告。警告 |
| 部品のデータが宣言した形（`static shape`）と合わない、または部品が描くときに例外を出した（`compData`：どの部品の、どこが（場所・期待・実際）違うか、形と見本。規格 R-components）。スライドの段階は `data-step` の要素と `.concl` からも数えるので、部品が描けなくても口述原稿が「スライドにない段階」にならない | エラー |
| コンソールのエラー（言葉だけ。スタックの行とファイルの場所・一時フォルダ・手元のサーバーの URL は除く） | エラー |
| 段階 0 で見えている本文 | 情報 |
| タイトルが 26 字（全角）を超える（日本語）/ 60 文字を超える（英語） | エラー / 警告 |
| タイトルがコロンで終わる | エラー |
| `layout-tate`：縦組みのタイトルが列に収まらない | エラー |
| 結論の行が 35 字を超える（日本語）/ 70 文字を超える（英語）。結論が枠からはみ出す（`layout-tate` の縦の列でも） | エラー / 警告。エラー |
| 本文が 565px（`noconcl` は 680px）より下、1236px より右に出る。`layout-tate` では 680px より下、1162px より右（見出しの列に重なる）、124px より左（結論の列に重なる。結論がなければ 44px） | エラー |
| 本文の字が 27px 未満、表・図の字が 24px 未満、SVG の字が 24px 未満（見出しに「文献」を含むスライドは除く。`rt` の振り仮名は数えない） | エラー |
| `overflow` が `visible` でない箱で切れる字（`textClipped`）、枠（viewBox）で切れるかスライドの外に出る SVG の字（`svgTextOut`）、まわりの `<rect>` からはみ出す SVG の字（`svgTextBox`）、`.body` の外に置いてスライドの外に出るか見出し・結論の行・ページ番号に重なる字（`outsideBody`）。`data-clip` を付けた要素の中の字はこれらで見ない（[約束事 §10](contract.ja.md#10-品質チェックわざと切る)）。`bodyBottom` のスライドでは、`.body` の中の字がスライドの外に出ることを重ねて知らせない | 警告 |
| どのスライドでも（表紙・章の扉・`layout-tate`・絶対位置の配置）：`.body` のないスライドで 1280×720 の外に出る字（`textOffSlide`。`.body` のあるスライドでは `outsideBody`）、ほかの字の箱やスライドの帯（飾り。表紙の上の帯など）に重なる字の箱（`textOverlap`：2 つの箱の行の矩形が縦横とも 2px を超えて重なる。KaTeX の式は式の見た目の箱 1 つで比べる。親と子、同じ部品の中の字どうし、SVG の字は比べない。本文の場所のエラーのあるスライドでは、本文の字と見出し・結論の行の重なりを重ねて知らせない）。表紙と章の扉では、置ける子要素と副題の置き場所を添える。`data-clip` の中の字、見えない字、KaTeX の MathML、`.sr-only` は見ない | 警告 |
| 表のセル（`td`・`th`）の語が途中で折り返す（`cellWordBreak`）：日本語・中国語の字を含み、空白を除いて 6 字までのセルが 2 行以上になる、または日本語・中国語の字のない語（`Intl.Segmenter` の語）の途中で行が変わる（ブラウザは英語の語を空白やハイフンでしか折らない。`overflow-wrap`・`word-break` で割れる）。長い日本語のセルがふつうに折り返すのは知らせない。直し方は、列を減らす・語を短くする・その列を広げる | 警告 |
| 本文の「です・ます」（日本語） | エラー |
| 組まれていない式、KaTeX のエラー | エラー |
| デッキの中で「、。」と「，．」が混ざる（日本語） | 警告 |
| 口述原稿のない段階 | 警告 |
| 古い音声：段階の音声がほかの口述原稿から作られている（`inputHash` が違うか `null`。`inputHash` がなければ TTS の控え `audio/seg_<digest>.json` で比べる）— `audio: stale` | 警告 |
| 式を読み上げている口述原稿（発言ごとにその言語の規則で。下を参照。「Markdown と HTML」のように英字の名前を挙げるだけの日本語の文は式としない） | 警告 |
| 1 ターンが 200 字（日本語）/ 60 語（ほかの言語）を超える | 情報 |
| 口述原稿の言語がスライドの言語と違う（`narrLang`） | 情報 |
| `--fg --term --emph --title --accent2` と `--bg` のコントラストが 4.5:1 未満。`--muted` が 3:1 未満 | エラー。警告 |
| 部品の描画が呼び出し順で変わる | エラー |
| 注目の演出の目印が無い。段階ごとの印の一覧 | 警告。情報 |
| モーフ：元のスライドが無い、同じ `data-id` が無い、ID の重複。対応の一覧 | 警告。情報 |
| `alt` の無い `<img>`、`aria-label`・`<title>` の無い SVG の図、名前の無い部品 | 警告、警告、情報 |
| タイムラインの合計と 1 枚ごとの長さ | 情報 |

スライドと口述原稿の言語は違ってもよい（字幕だけ別の言語にする、日本語のスライドに英語の口述原稿を付けるなど）。口述原稿の言語は `voice.json` の `"lang"`（TTS と同じ）、なければ、ほとんどの発言がデッキと別の字で書かれているときはその言語（日本語のデッキで日本語の字がない、ほかの言語のデッキでほとんどの発言に日本語の字がある）、それもなければデッキの `<html lang>`。口述原稿の品質チェックは発言ごとにその言語で見る：日本語の字のある発言は日本語の規則、英語の文は英語の規則（式とみなすのは `\` `^` `_` と密な演算子だけ）。

## build

`node kit/build.mjs <deck.html | 作業フォルダ> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio] [--portable] [--play-only]`（`npm run build -- …` でも）。フォルダを渡すとその中の `deck.html` を組む（`deck.html` がなければ、何が要るかを言って終了コード 1）。

| 選択肢 | 意味 |
|---|---|
| `-o ファイル` | 出力（既定 `<作業フォルダ>/out/<名前>.html`） |
| `--theme 名前` | テーマ（[テーマ](#テーマ)） |
| `--dev` | 編集用の `data-src` を付け、字を絞らない（開発サーバーが使う） |
| `--embed-audio` | 音声を AAC 64 kbps モノラルで埋め込む（ffmpeg が要る。なければ WAV のまま、警告）。なしでは出力からの相対パスで参照する |
| `--portable`・`--play-only` | 原稿も中に持つ 1 ファイル。[1 ファイル](#1-ファイル--portable) |

最後の行に、スライド・式・部品・字のファイル・口述原稿の段階・音声の段階・テーマ・大きさを出す。キャッシュ：絞った字は `$TMPDIR/motion-slides-fonts/`（使う字・TTF のハッシュ・fonttools の版で鍵を作る。`uv` で `fonttools==4.67.0` と `brotli==1.2.0` を使う）、圧縮した音声は `$TMPDIR/motion-slides-audio/`。埋め込む字：HTML の文字参照と `\u` エスケープをほどいた原稿の字、`<script type="application/json">` と口述原稿の文字列、使う部品の JS の文字列（日本語以外のデッキでは和文を除く）、印字できる ASCII（数字、ページ番号の `/`）、`Appendix`、日本語のデッキではさらに `付録` とよく使う和文の約物。ローカルの素材は[素材](#素材build-で埋め込む)のとおり埋め込む。


作業フォルダの部品（`<deck>/components/<名前>/index.js`）は実体のパスが作業フォルダの中にあるときだけ、部品庫の部品は `vendor/components/` の中にあるときだけ読む。作業フォルダの部品が外を指していれば、警告して読まず、部品庫のものにも替えない。作業フォルダの中の出力（`out/…`）と `egatari.json` は、シンボリックリンク（そのファイルか途中のフォルダ）を通しては書かない。リンクがあれば書かずに失敗する。

### 組み立ての上限

組み立ては埋め込みながら数え、上限を超えたらその場で `build-too-large` で止まる：原稿（32 Mi 字）、取り込みと埋め込みの回数の合計（`/*INCLUDE*/`・`{{JSON}}`・`{{FIG}}`・`data:` URI・`<link rel="stylesheet">`・`<script src>`・`@import`：10000）、前処理の後の大きさ（64 Mi 字）と埋め込み・式の後の大きさ（256 Mi 字）、解析の前のタグの数（500000）、式の数（20000）。読むファイルはすべて（テーマのファイル・ロゴ・親のテーマ、部品、口述原稿、音声、字、実行系も）取り込みの回数に数え、読んだ大きさの合計（`readChars`：256 Mi。文字のファイルはバイト数、base64 は字数）にも、読む前にファイルの大きさで数える（大きすぎるものは読まずに断る）。大きさは見積もりで、読んだ後にも実際に読んだ大きさで数える（大きくなっていたファイルは断る）。大きさはいつもバイト数で数える（バイト数を返さない口から読んだ文字も、UTF-16 の字数でなく UTF-8 のバイト数で）。読むのは通常のファイルだけで、FIFO・デバイス・ソケットは `build-not-a-file` で断る。組んだ出力の全体も、つなぐ前に 256 Mi 字までかを確かめる。音声は数えたバイトから圧縮する：`.wav` を数えた大きさまで 1 回だけ読み、ffmpeg には元のパスでなく、そのバイトの自分だけが読める写しを渡す。持ち運べる形式の書き出しは、自分で読むもの（口述原稿・原稿のファイルの写し・`voice.json`・`egatari.json`・圧縮の前の音声）も組み立てと同じ数え方に数え、全体の大きさを、それぞれを作る前に確かめる：塊は見積もった字数、索引は JSON にする前の下からの見積もり（読み手の上限 `indexBytes` の 4 MiB とも比べる）、読める層は実体参照に直した後の字数を作りながら数える。base64 はすべてを確かめた後にだけ作る。実際のデッキははるかに小さい（`examples/tmlr2026-calibration`：原稿 11 KB・式 27・タグ 3400）。`build(env, src, {limits: {...}})` で変えられる（`kit/core/build-core.mjs` の `BUILD_LIMITS`）。編集アプリでは組み立てを Worker で動かし、60 秒で止める。作業場所から読むのは組み立てが参照したファイルだけで、同時に 8 つまで、1 つの読み取りは一覧の大きさまで（読み始める前に取っておいた分。一覧の後で大きくなったファイルは断る）。組み立ての外では、開発サーバー・編集アプリの問い合わせ・`npm run ids` が `deck.html`（32 MiB）・`narration.md`（16 MiB）・`comments.json`（4 MiB）を決まった上限で読み（`kit/core/bounded-read-core.mjs` の `READ_LIMITS`）、`npm run portable -- unpack` は形式の 100 MiB を超える入力を読む前に断る。どれも 1 つの上限つきの読み取りの口（Node は `kit/bounded-read.mjs`、ブラウザは `app/bounded-read.js`）を通し、ほかの場所の生の読み取りは `tools/test-raw-reads.mjs` が失敗にする。

### 1 ファイル（`--portable`）

`node kit/build.mjs <deck.html> --portable` は `<作業フォルダ>/<教材の題名>.ega.html` を書き（名前は編集アプリの書き出しと同じ規則：`metadata.title`、なければデッキの `<title>`。どの OS でも使える名前にする。題名がなければ `<デッキの名前>.ega.html`）、書いたファイルの絶対パスを表示する。ふつうの build と同じように再生でき、さらにデッキの原稿を中に持つので、元のフォルダがなくてもフォルダに戻せる（編集器で開き直せる）。持ち運べるデッキの公開の形式 **Egatari（絵語り）**（[仕様](https://github.com/egatari/egatari-spec)、1.0 の草案）に従う。拡張子・ブロックの id・メディアタイプはその仕様のもの。

- **入るもの**：build が作業フォルダから読むファイルすべて（`deck.html`・`narration.md`・`macros.tex`・`timeline.json`・データ・図・画像・CSS・作業フォルダの部品とテーマ）、ローカルのパスを声の名前だけにした `voice.json`、`audio/manifest.json` の音声のうち口述原稿にある段階のもの（`--embed-audio` と同じく AAC に圧縮。ffmpeg がなければ WAV のまま、警告）。音声は 1 回だけ入り、実行系はそこから再生する。
- **入らないもの**：`comments.json`、ドットで始まるファイルとフォルダ（`.cache/`・`.git/`・`.env` など）、`out/`・`video/`・`bundle/`・`node_modules/`、控え、`*.local.json`、資格情報、使っていない音声と TTS の控えのファイル。build が読んだのに外したファイルは知らせる。このリポジトリの部品とテーマは写さず、名前・版・SHA-256 で参照する（自分のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）のテーマは、原稿の `themes/<名前>/` として写す）。部品庫・テーマ庫の名前は 1 つの識別子（`^[a-z][a-z0-9-]{0,63}$`）で、それ以外（パス・`..`・大文字）の名前を書いたファイルは読み手が断る。
- **教材の id**：初めての書き出しで、作業フォルダに乱数の `docId` を持つ `egatari.json` を作る。デッキと一緒に残す（次の書き出しも同じ id になる）。任意の `metadata` に `license`（SPDX の識別子か URL）・`copyright`・`attribution`・`creators`・`description`・`accessibility`・`curriculum`・`completion`・`derivedFrom`・`authorship`・`audience` を書ける。`license`・`copyright`・`attribution` は実行系のメタデータにも写すので、再生専用の写しにも残る。題と言語は `<title>` と `<html lang>` から。
- **スクリプトなしで読める口述原稿**：全段階の表示用の文字を、ふつうの HTML としても入れる（デッキが動いているときは隠す）。保存・検索・読み上げのため。
- **拡張の行**（`@x-<名前>-<欄> 値`）は段階ごとにファイルの索引に集める。
- **添付**（形式の §3.8。下書き・試行。§3.8 の案）：組み立てには使わない、読み手のためのファイル。`attachments/` の下（下のフォルダもよい）に置く：元の原稿（TeX・Word）、組んだ PDF、コード、データ、補足。役割・題・説明は `egatari.json` に、ファイルの `index.attachments` と同じ形で書く：`"attachments": [{"path": "attachments/paper.pdf", "role": "pdf", "title": "論文（PDF）", "description": "雑誌に載った版。"}]`。`role` は `source`・`pdf`・`code`・`data`・`supplement` のどれか、`title` は要る（ダウンロードの一覧に出す短い名前。1 行で 120 字まで。字は Schema と同じく Unicode の符号位置で数える）、`description` は任意（1〜2 文の文字だけ、1 行で 300 字まで。ダウンロードの一覧の題の下に出る。ほかの項目は残す）。`attachments/` の下の通常のファイルを入れる（シンボリックリンクはたどらない。隠しファイル・控え・認証の情報は上と同じく外す）。`index.attachments` に載るのは正しい役割と正しい題のあるものだけで、ほかは知らせて入れるだけ。正しくない説明は知らせて落とし、項目は一覧に載せる。
  - **役割ごとの形式**（§3.8。`kit/core/attach-content.mjs`）：`pdf` は PDF、`data` は CSV・TSV・JSON・テキスト・xlsx、`code` はプログラムの原稿（`.py`・`.r`・`.jl`・`.c`・`.mjs`・`.ts`・`.sh` など）・ノートブック（`.ipynb`）・環境の定義（`requirements.txt`・`pyproject.toml`・`uv.lock`・`environment.yml`・`Dockerfile` など）、`source` は TeX・Markdown・テキスト（BibTeX など）・docx、`supplement` は PNG・JPEG・WebP・PDF・テキスト。添付にしないもの：実行できるファイル、どの役割でも、よくある OS が実行する・スクリプトとして開く拡張子（仕様の一覧のとおり：`.js`・`.jse`・`.vbs`・`.vbe`・`.wsf`・`.wsh`・`.hta`・`.bat`・`.cmd`・`.com`・`.scr`・`.ps1`・`.command`・`.app`・`.jar`・`.reg`・`.lnk`。JavaScript の原稿は `.mjs`・`.cjs`・`.ts` で添付する）、WebAssembly、マクロを入れられる Office と古い形式の Office（`.xlsm`・`.docm`・`.doc`・`.xls`・`.ppt`・RTF）、HTML、SVG、ほかの `.ega.html`、アーカイブ・入れ物（ZIP・TAR・7z など）、音声と動画、ほかのどの形式も。形式は拡張子から決め、中身（先頭の印と構造）と照らすので、名前を替えた実行ファイル・`.txt` という名前の HTML・2 つの形式を重ねたファイル（ZIP を後ろに付けた PDF、先頭に PDF の印のある画像）は断る。添付の塊には、その形式の媒体型を書く（`application/pdf`・`text/csv`、プログラムの原稿は `text/plain` など）。
  - **中身の条件**（何も実行せず、上限の内で確かめる。展開して読むのは 64 MiB まで、ZIP の項目の数と宣言の大きさにも上限があり、項目が重なるもの・宣言より大きく展開されるものは断る）：PDF は JavaScript・埋め込んだファイル・XFA がないこと。開いたときの動作（`/OpenAction`・`/AA`）は行き先か文書の中へ移る `GoTo`（LaTeX の hyperref が書く形）だけ、リンクは `GoTo` と `URI` だけで、ほかの動作（`Launch`・`SubmitForm`・`ImportData`・`GoToR`・`GoToE`・`Rendition`・`Named` など）はないこと。圧縮した object stream の中も見る。暗号化した PDF は、空の利用者パスワードで開けるもの（RC4・AES-128・AES-256）だけを復号して確かめ、ほかは断る。xlsx と docx（ZIP としてメモリの上で読み、ディスクに展開しない）：マクロ（`vbaProject.bin`・マクロを入れられる形式）・ActiveX・埋め込んだ object・外部リンクやほかの外への関係・データの接続や Web クエリ・DDE・外のデータを取りにいく関数（`WEBSERVICE`・`RTD`・`IMAGE`・`STOCKHISTORY`・`CALL` など）・実行する・取りにいくフィールド（`DDEAUTO`・`INCLUDETEXT`・`INCLUDEPICTURE`・`LINK` など。入れ子のフィールドで名前を作るものも）・外のテンプレートがないこと。テキストはテキストであること（NUL がない。BOM のある UTF-16 はよい）、JSON とノートブックは読めること。
  - **どうなるか**：組み立て（`--portable`）は、添付にできない形式や条件に合わない添付を、規則の名前を添えて知らせて外す。CSV・TSV・xlsx の、表計算のソフトが数式として読みうる値（`=`・`+`・`-`・`@`・タブで始まるもの。数は除く）と、資格情報や機械のパスらしい文字は、知らせて入れる。品質チェックは、仕様が禁じるもの（MUST NOT：許されない形式・役割が受けない形式・音声と動画・JavaScript のある PDF・マクロ・2 つの形式を重ねたファイル）をエラー、ほか（SHOULD：ほかの条件・中身が形式と合わない・確かめられない。数式として読まれる値・資格情報）を警告にする。
  - 上限は 1 つ 10 MiB・合わせて 20 MiB・100 個（base64 なので 1 ファイルではおよそ 4/3 倍）。超えるものは知らせて外す（`kit/core/attachments.mjs` の `ATTACH_LIMITS`）。添付はコードに数えない（Extended にならない）。`requires` にも入れない（読み手は無視してよい）。読むのは組み立てと同じ大きさの数え方の内。
  - **1 ファイルの中の `egatari.json`** には、`index.attachments` とちょうど同じ一覧を書く（§3.3）：読み手の一覧に出ない項目は 1 ファイルの写しから除き、知らせる。作業フォルダの `egatari.json` は変えない。展開は `index.attachments` を `egatari.json` に書き（`egatari.json` のない文書でも）、フォルダをまとめるときは一覧を `egatari.json` から読むので、展開してまとめ直しても記録は変わらない。`egatari.json` の一覧が索引と違う文書は読まない（`attachments-mismatch`）。
  - 1 ファイルの再生器は **?** の一覧（題・説明・ファイル名・役割・大きさ）と、帯のクリップのボタンに出し、**ダウンロードだけ**にする：出すのは、題が正しく、役割が受ける拡張子で、塊の媒体型がそれに合うものだけ（索引に書いてあっても、`.html`・`.js` や `pdf` として書いた CSV は出さない）。保存する名前はパスのファイル名そのもの（OS が受けない名前は、替えずに出さない）。コードの添付には「出どころを信頼できるときだけ、コードを実行してください」と添える。索引の hash と、添付ごとの大きさと SHA-256 を確かめ、先頭のバイトを形式と照らし（HTML で始まる `.txt` は保存しない）、中身を `application/octet-stream` としてダウンロードのリンクで保存させる。ページでも新しいタブでも開かない・実行しない。再生専用（`--play-only`）とふつうの組み立てには添付は入らない（形式が保存の層を除く）。品質チェックは、役割や題がない・知らない役割・書いたのにないファイル・使えない名前（`attachments/` の外・`..`・予約名・大文字小文字の重なり・隠しファイル・リンク）・上限を超えるものも警告する
- **書き出した写し**（`exportedFrom`、仕様 §3.1）：作業フォルダからの書き出し（`--portable`・`npm run portable -- pack`・編集アプリの「1 ファイルを書き出す」）は、索引に `{"kind": "folder", "sourceSha256": …}`（書き出したときの原稿の hash）を書く。時刻・パス・利用者の名前は入れないので、書き出しはバイトまで同じに作り直せ、展開してまとめると同じファイルに戻る。編集アプリで 1 ファイルを保存しても（組み直さない保存も）印は変えないので、原稿の hash が印の値と違えば、書き出しの後に写しを直したと分かる。新しい教材として保存する（新しい `docId`）と印を外す。フォルダから書き出し直すと置き換わる。1 ファイルが原本の教材（フォルダなしで編集アプリが保存したもの・貼り付けたもの・`deck.html` だけから開いたもの）には印がなく、再生専用の派生には索引がない。展開すると新しいフォルダが原本になる：`egatari.json` は印を持たず、次の書き出しが新しい印を書く。
- **音声の記録**：段階の音声ごとに、作ったときの口述原稿の hash を残す。TTS の控えから、音声を作った後に口述原稿が変わったと分かるときは、その hash を `null`（分からない＝古い）にする。展開してまとめ直しても `null` のまま。実行系の音声の項目には音声のメディアタイプも書くので、再生器が推し量らずに済む。
- 30 MiB を超えると警告する（長い教材は章に分ける）。

| 選択肢 | 意味 |
|---|---|
| `--portable` | 1 ファイルを書く（既定 `<作業フォルダ>/<教材の題名>.ega.html`。作業フォルダの最上位。`-o` で場所） |
| `--play-only` | 再生専用の写しを書く（既定 `<作業フォルダ>/<教材の題名>.play.ega.html`）：原稿は入れず、実行系とその音声だけ。原稿や拡張のデータを渡したくない学習者向け |

`npm run portable -- unpack <ファイル> <フォルダ> [--force]` は原稿と音声を `<フォルダ>` に出す（音声の記録から `audio/manifest.json` も作るので、そのフォルダはそのまま build・pack できる）。ファイルは文字列として読み、中のスクリプトは動かさない。索引とすべての hash、仕様の上限とパスの規則を確かめ、`<フォルダ>` の外やシンボリックリンクを通る書き込みは断り、空でない `<フォルダ>` は `--force` がなければ断る。`npm run portable -- pack <フォルダ> [-o ファイル] [--play-only]` はそのフォルダで `build --portable` をするのと同じ。展開したフォルダをまとめると同じファイルに戻る。`npm run portable -- compare <ファイル> <フォルダ>` は、作業フォルダから書き出した写しとそのフォルダ（`egatari.json` の `docId` が同じ）を受け取り、書き出しの後にどちらを直したかを原稿の hash で言う：`same`（どちらも直していない）・`copy`（写しを直した。写しを展開すればフォルダに戻せる）・`folder`（フォルダを直した。書き出し直す）・`both`（両方。どちらを残すかを選ぶ。混ぜない）。何も書かない。`exportedFrom` のないファイルと、ほかの教材のフォルダは断る。

1 ファイルの読み取り（unpack と[編集アプリ](editor.ja.md#1-ファイルフォルダなし)）は、ほかに、中に入った `audio/manifest.json`（いつも音声の記録から作るもの）と、`docId` が索引と違う設定のファイルも断り、原稿の hash を files から計算し直す。索引や実行系のメタデータの値と違えば、組んだ教材と原稿が食い違うと知らせる。新しい major の版のファイルと、読み手の実装していない機能を必須とするファイルは、索引と塊が 1.x の規則で確かめられたときだけ原稿を取り出せる（`readPortable(text, {extract: true})` と編集アプリの「作業フォルダに書き出す…」）。編集も書き出し（作り直し）もしない。

#### 組み直さない編集（段 A）

`kit/core/tier-a.mjs`（`tierA(original, files, {identity?, fonts?})`。Node にもブラウザにも依存せず、何も実行しない）は、口述原稿・音声・秒数の上書きの編集を、形式の段 A（§7.2）として、組み直さずに 1 ファイルに入れる。`files` は直した作業フォルダ（展開した形。`audio/manifest.json` を含む）。書き換えるのは次の所だけ：`deck-narration`・`deck-marks`・`deck-timing`・`deck-audio` の変わった項目（ほかの項目は書き方ごとバイトのまま）、読める層の変わった `<div data-step-key>`、`deck-meta` の `sourceSha256`（`identity` があれば `docId` も）、索引の変わった項目（`files`・`blobs`・変わった音声の記録・`requires`・`sourceSha256`・拡張の行から作る拡張のうち変わった行から作られる項目、`identity` があれば `docId` と `metadata.derivedFrom`。そのときは `exportedFrom` を外す）とその `data-sha256`、塊（新しい中身を足し、参照されなくなったものを除く）、そして変わった口述原稿に、ファイルの `@font-face` がまかなわない字があるときだけ、その字を含む `@fontsource` の分割ファイルを入れた新しい `<style id="…font-supplement-<n>">`（`fonts`：`{faces(key), load(file)}`）。`<n>` は今ある補いの番号のいちばん大きいものの次（0 から）で、`@font-face` を持つ最後の style 要素の後に置き、埋め込んである字（family・weight・style）のうちその字を持たないものごとに 1 つの `@font-face` を書く（400 だけを埋め込んだファイルには 400 だけ。ファイルが埋め込まない family には書かず、知らせる）。ほかのバイトはそのまま。知らない項目はどの深さでも残す。口述原稿が変わった段階の音声の記録はそのまま（`inputHash` が合わなくなるので古い）。段階の口述原稿をまるごと消したときは、その音声の記録と塊も消して知らせる。どのスライドにも当たらない鍵の口述原稿は読める層に入れず、知らせる。返すのは `{ok: true, html, index, deckMeta, changes, warnings}` か、組み直しが要るとき（`source-changed`：`narration.md`・`timeline.json`・設定のファイルのほかが変わった）、組んだ教材と原稿が食い違うとき（`source-mismatch`）、`timeline.json` が JSON の object でないとき（`timeline`）、場所が見つからないとき（`layout`）の `{ok: false, code, reason}`。結果を展開してまとめ直すと、原稿のファイル・音声の記録・実行系の JSON・読める層・索引は同じで、字（組み直しは `deck-base` に字を選び直し、補いは足さない）と、塊の並びが違うことがある。`tools/test-tier-a.mjs` が場所を見分ける差分（`tools/tier-a-diff.mjs`）で確かめる。

添付は保存の層の項目なので、`attachments/` の下のファイルを足す・消す・名前を替えること、`egatari.json` の役割と題を替えることも段 A で済む：変わるのは索引（`files`・`blobs`・`sourceSha256`・`attachments`）・塊・`deck-meta.sourceSha256` だけ。スライドの原稿がその添付のパスを書いているとき（組み立てが読んだかもしれない）は `source-changed`、足した・中身を替えた・役割を替えた添付が上限・名前の規則・上の §3.8 の形式と条件に合わないときは `attachments` で断る。前から 1 ファイルにあって変わっていない添付はそのまま残し、合わなければ知らせる。`egatari.json` が `index.attachments` にない項目（役割や題のないもの）を書いているときは、保存する写しを `index.attachments` とちょうど同じ一覧にし、結果の `config` にその文字を入れる（エディタは作業場所にも書く）。

## TTS

`uv run --project tts python tts/synth.py <deckdir> [選択肢]`。詳しくは [video.ja.md](video.ja.md)。

| 選択肢 | 意味 |
|---|---|
| `--voices expert=a,novice=b` | 声（`voice.json` より優先） |
| `--ref-dir DIR` | 参照音声のフォルダ（`IRODORI_REF_DIR` より優先。既定 `tts/voices/`） |
| `--engine irodori\|voxcpm2` | `voice.json` の `engine` とデッキの言語より優先 |
| `--yomi FILE` | 読み辞書（`MOTION_YOMI` より優先。既定 `tts/yomi.yaml`）。日本語だけ |
| `--only 鍵,…` | この段階（`スライドの鍵:段階`）だけ |
| `--dry-run` | TTS を呼ばず、推定の長さの無音（日本語 7.5 字/秒、英語 2.5 語/秒）。キャッシュは別 |
| `--force` | 音声のキャッシュを無視する |
| `--replace-recorded` | 録音と取り込みの音声（manifest の `kind` が `recorded`・`imported`。編集アプリの音声の板が書く）も TTS で作り直す。付けなければ残す |

| `voice.json` の項目 | 意味 |
|---|---|
| `expert`、`novice` | 名前（`<参照音声のフォルダ>/<名前>.wav`）かパス（`/` を含むか `.wav` で終わる。相対ならデッキから）。既定 `bob`、`alice` |
| `lang` | 言語（既定はデッキの HTML の `lang`。渡したファイル、`<deckdir>/deck.html`、フォルダに 1 つだけある `*.html` の順。なければ `ja`） |
| `engine` | `irodori`（日本語の既定）か `voxcpm2`（それ以外の既定） |

`audio/seg_<digest>.wav`、`audio/seg_<digest>.json`、`audio/manifest.json` を書く（原稿から消えた段階は manifest から外す。wav は残す）。manifest の各段階には `kind: "tts"` と、その段階の口述原稿の hash `inputHash`（format spec §5.4）も書くので、後で口述原稿が変わったことを編集アプリと品質チェックが見分けられる。録音と取り込みの音声は残す（`--replace-recorded` を参照）。編集アプリでも、ブラウザで 1 段階ずつ録音・取り込み・作り直しができる（[編集アプリ](editor.ja.md#口述原稿の音声音声の板)）。その後処理は `tts/core.py` と同じ数を使う。dry-run の音声が残っていれば警告する。サーバーが localhost でなければ、声のパスを手元で確かめない。終わったら build し直す。

## 書き出し

`node render/render.mjs <組んだ.html> --out <フォルダ> [選択肢]`（`?mode=video` で開く）。

| 選択肢 | 意味 |
|---|---|
| `--out フォルダ` | 必須 |
| `--fps n` | 既定 30 |
| `--scale x` | 既定 1.5（1920×1080） |
| `--only 鍵,…` | この段階だけ。ほかはそのまま |
| `--full` | `full.mp4` も。章が 2 つ以上なら `chapter_NN.mp4` と `chapters.json` も（全部のクリップが要る） |
| `--force` | `.render-cache.json` を無視する |
| `--captions` | 口述原稿の字幕を映像に焼き込む（`?captions=1`）。キャッシュの鍵に入る |

出力：`clip_NNNN.mp4`、`clip_NNNN.png`、`timeline.out.json`（`source, fps, scale, width, height, duration, clipDuration, segments[]`。各段階は `index, clip, still, key, slideKey, stepKey, i, k, title, chapter, start, dur, anim, lead, audioDur, audioOffset, frames, clipDur, clipStart, start_ms, end_ms, transcript, text`）、`.render-cache.json`。段階の数より後ろのクリップは消す。

## 道具

| コマンド | 用途 |
|---|---|
| `npm run new -- <フォルダ> [--lang en\|ja] [--theme 名前] [--title "…"]` | きれいな雛形から新しい作業フォルダ（`deck.html` と `narration.md`）を作る。空でないフォルダには書かない |
| `npm run ids -- <作業フォルダ \| deck.html> [--dry-run]` | id のないスライドに新しい id（`s-` と base32 の 6 字、乱数）を付け、`narration.md` の見出しを `## 見出し {#id}` にし、`audio/manifest.json`・`timeline.json`・`comments.json` と `data-morph="…"` の鍵を付け替える。音声は作り直さない。控えは `.cache/edits/`、改行はそのまま、2 回目は何も変えない。鍵の重なり・id の衝突・規則に合わない id のあるデッキでは何もしない |
| `npm run portable -- unpack <ファイル> <フォルダ> [--force]`・`npm run portable -- pack <フォルダ> [-o ファイル] [--play-only]`・`npm run portable -- compare <ファイル> <フォルダ>` | 1 ファイル ↔ フォルダ。[1 ファイル](#1-ファイル--portable) |
| `npm run build:app` | 編集アプリを作る：`dist/` の配信版（GitHub Pages 用。`dist/index.html`）と 1 ファイルの `dist/editor.html`。[editor.ja.md](editor.ja.md) |
| `node tools/test-app.mjs` | 編集アプリのテスト（OPFS のフォルダ、編集、口述原稿、指示、外での変更、書き出し、発表者ビュー） |
| `node tools/get-fonts.mjs` | BIZ UDPゴシックと BIZ UDP明朝の TTF を `fonts/` に取ってくる（uv で使っている字だけに絞れるようになる） |
| `node tools/test-kokugo-example.mjs` | `examples/kokugo-kanbun` の漢文が部品庫の `m-kanbun` で知らせなしに読めるか（ブラウザなし。部品そのものの試験は egatari/components） |
| `node tools/test-layout-tate.mjs [作業フォルダ]` | `default` と `kokugo` のテーマでの `layout-tate` のスライド：見出しの列・本文・結論の列・ページ番号が重ならずに置かれる、seek の決定性、品質チェックの規格、スライドの鍵と読める層が変わらない |
| `node tools/pdf.mjs <組んだ.html> <出力.pdf>` | PDF。1 枚 1 ページ |
| `node tools/shot.mjs <組んだ.html> <出力.png> [i] [k] [mode]` | スライド i（0 始まり）、段階 k の最終状態の PNG |
| `npm run sheet -- <作業フォルダ \| deck.html \| 組んだ.html \| .ega.html> [out.png] [--mode talk] [--cols 4] [--width 640] [--tiles]` | コンタクトシート：全スライドの最終段階を 1 枚の PNG に（番号は 1 始まり、鍵が短ければ併記。タイルの幅は既定 640 px。出力は `<デッキ>/out/sheet.png`）。`--tiles` で 1 枚ずつの PNG を `<out>-tiles/` にも書く。出力の場所と枚数を印字する |
| `npm run comment-shots -- <作業フォルダ \| deck.html> [id …] [--all]` | `comments.json` の未対応の指示（id を並べればそれだけ、`--all` なら全部）ごとに、その段階の最終状態にピン（と手書きの線）を描いた PNG：`<デッキ>/.cache/comment-shots/<id>.png`（ピンの周りのスライドの 480×300 を 2 倍で。線があれば少なくとも線の外接矩形＋48 px。ピンがなければスライド全体）、`<id>-full.png`、`index.json`。段階がなくなった指示は撮らずに知らせる |
| `node tools/catalog.mjs` | `vendor/components/CATALOG.md` を作り直す |
| `npm run components:update -- vX.Y.Z [--from <フォルダ>]` | egatari/components のリリースを `vendor/components/` と `components.lock.json` に取り込む（`manifest.json` の sha256 で確かめる。版は置き換えない） |
| `npm run components:check` | `vendor/components` が `components.lock.json` と合うか（ネットワークなし） |
| `node tools/narration-json.mjs <narration.md> [--voice json]` | 口述原稿を解析した JSON（`synth.py` が使う） |
| `node tools/smoke.mjs <組んだ.html> <フォルダ>` | タイムラインといくつかの画面 |
| `node tools/test-components.mjs [名前 …] [--shots フォルダ]` | 部品の見本を組んで確かめる |
| `node tools/test-tools.mjs <組んだ.html> [フォルダ]` | 一覧・ペン・レーザー・印刷・発表者ビューからの書き込み |
| `node tools/test-controls.mjs <組んだ.html> [フォルダ]` | 操作の帯・キーの一覧・発表者ビューのボタン |
| `node tools/test-autoplay.mjs <組んだ.html>` | 自動再生と発表者ビューのボタン |
| `node tools/test-links.mjs [フォルダ]` | スライドへのリンク：開いたときの #・モードごとのクリック・戻る（ボタン・キー・ブラウザの履歴）・自動再生を保つこと・埋め込み（`cause: "link"` の `position`、`linkRefused`）・発表者ビュー・`m-menu`・品質チェックのエラー |
| `node tools/test-dev-server.mjs [作業用のフォルダ]` | `examples/minimal` の写しで開発サーバーを確かめる |
| `node tools/flake.mjs <組んだ.html> <i> <k> <フォルダ>` | 「呼び出し順に依存」の誤検出を調べる |

## 環境変数

| 変数 | 使うもの | 意味 | 既定 |
|---|---|---|---|
| `CHROME_PATH` | 品質チェック・PDF・shot・書き出し・テスト | ブラウザの実行ファイル | Google Chrome、なければ Microsoft Edge、それもなければ Playwright の Chromium |
| `IRODORI_URL` | TTS | OpenAI 互換の音声合成サーバー | `http://localhost:8882` |
| `IRODORI_REF_DIR` | TTS | 参照音声のフォルダ（`--ref-dir` が優先） | `tts/voices/` |
| `MOTION_YOMI` | TTS | 読み辞書（`--yomi` が優先） | `tts/yomi.yaml` |
| `EGATARI_THEMES` | 組み立て・品質チェック・開発サーバー・1 ファイル | 自分のテーマのフォルダ。作業フォルダの後、同梱の `themes/` の前に探す（[テーマ](#テーマ)）。区切りは `:`（Windows は `;`） | なし。あれば、その後に `~/.egatari/themes` を探す |
