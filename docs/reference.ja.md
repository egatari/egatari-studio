<!-- i18n: pair=reference.md sha256=2aebabcccd4265dd -->
# リファレンス

[English](reference.md) | 日本語

使える選択肢・記法・キーを、コードから拾って 1 行ずつ並べたもの。スライドと台本の記法・タイムライン・強調・モーフの規範の文は [形式の仕様 §8](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#8-authoring-source-contract-version-1) と §5.5。このページは Studio の実装の早見で、[contract.ja.md](contract.ja.md) はどの節に何があるかと Studio の注を書く。手順の説明は [README](../README.ja.md)、[dev-server.ja.md](dev-server.ja.md)、[video.ja.md](video.ja.md)。

目次：[スライドの記法](#スライドの記法) · [台本](#台本narrationmd) · [長さ](#長さtimelinejson) · [テーマ](#テーマ) · [パーツ](#パーツ) · [発表](#発表) · [開発サーバー](#開発サーバー) · [品質チェック](#品質チェック) · [build](#build) · [TTS](#tts) · [動画のエクスポート](#動画のエクスポート) · [ツール](#ツール) · [環境変数](#環境変数)

## スライドの記法

規範は形式の仕様 §8.0（スライド・ステップ・スライドの種類・数式・参照）と §8.1（スライドの id）。下の表は Studio の位置・手がかり・警告を足したもの。

### 作業フォルダのファイル

| ファイル | 読むもの | 用途 |
|---|---|---|
| `deck.html` | build | スライド（名前は自由。テンプレートは `examples/minimal/deck.html`） |
| `narration.md` | build・TTS・エクスポート | ステップごとの台本 |
| `timeline.json` | build | ステップの長さの例外 |
| `macros.tex` | build | KaTeX のマクロ（`\newcommand`、`\renewcommand`、`\def`。既定のマクロに足す） |
| `audio/manifest.json` | build | `tts/synth.py` と編集アプリの音声の板が書く（ステップごとに `file`・`dur`・`cues`・`sync`・`kind`・`inputHash`、TTS なら `recipe`。任意で `processing` と、鳴らし始める符号化の遅れ `startOffset`） |
| `voice.json` | TTS | 声・言語・エンジン |
| `figs/*.svg`、`data/*.json` | build | `{{FIG:…}}` / `{{JSON:…}}` の元 |
| `components/<名前>/index.js` | build | 教材専用のパーツ（パーツライブラリより先に探す） |
| `egatari.json` | build・Egatari ファイル | `docId`・metadata・添付の一覧。`components` はパーツライブラリのパーツのバージョンの固定（`{"bars": "1.0.0"}`、format spec §3.3。Egatari ファイルの中の写しにはエクスポートが使ったバージョンが入り、展開でそれが書かれるので、組み直しでバージョンが変わらない。固定がなければ `components.lock.json` の既定のバージョン） |
| `themes/<名前>/` | build | 教材専用のテーマ |
| `comments.json`、`.cache/edits/` | 開発サーバー | 開発サーバーが書く |
| `out/<名前>.html` | — | build の既定の出力 |

### スライドとクラス

| 書き方 | 意味 |
|---|---|
| `<div id="stage">` の中の `<section class="slide">` | 1 枚（1280×720）。`<h2>` 見出し、`<div class="body">` 本文、`<div class="concl"><span>…</span></div>` 結論の行 |
| `class="slide cover"` | 表紙。子要素は `.venue`（会場・授業の名前。top 120px）、`<h1>`（題名。top 200px。副題は `<br>` のあとの 2 行目に書くか（`<h1>題名<br>副題</h1>`）、`.venue` に入れる）、`.au`（著者・所属。top 450px。`<br>` で何行でも）で、テーマのロゴが左下に入る（`.logos`）。どれも絶対位置で、表紙には `.body` がない。ほかの要素（`<p class="sub">` など）は置き場所が決まらず、スライドの上端の帯に重なる。ほかの字は、スライドの `<style>` で `position:absolute` と `top` を決めて空いた場所に置く。字がスライドの外に出る・ほかの字や帯に重なると品質チェックが警告する（`textOffSlide`・`textOverlap`） |
| 表紙に `data-nologos` | この表紙にはロゴを入れない（表紙に `.logos` の要素が既にあるときも入れない） |
| `class="slide sec"` | 章の扉。題は `<h1>`（`<h2>` でも同じに見せ、品質チェックが知らせる）（`<h1>` は top 300px、`.lead` は top 390px。ほかの字は表紙と同じく自分で置く）。動画の `--full` の章の始まり |
| `class="slide sec appendix"` | 付録の扉。以降のページ番号は「付録」/ Appendix。`appendix` がなくても、文字に「付録」か Appendix を含む `sec` は付録の扉とみなす |
| `class="… static"` | ステップなし：全部見せる。`.concl` も別のステップにしない |
| `class="… nostep"` | 箇条書きを自動でステップにしない |
| `class="… noconcl"` | 結論の行なし：本文は 565px でなく 680px まで使える（既定の値。テーマの `metrics` で両方とも動く） |
| `class="… layout-tate"` | 縦組みのスライド：見出しは右端の縦の列、本文はその左に縦書き、結論の行は左端の縦の列（[国語](#国語kokugo)） |
| section の `id="…"` | スライドの id（形式 §8.1）。どのスライドにも付ける。[スライドの id](#スライドの-id) |
| `data-morph` / `data-morph="鍵"` | 前のスライド / その鍵のスライドからモーフで入る（[contract §8](contract.ja.md#8-モーフdata-morph)） |
| `data-chapter="名前"` | ここから章を始める（`sec` と同じ扱い。章の名前を指定） |
| 直下の子に `<div class="pn">` | ページ番号を自分で書く（なければ 2 枚目から `i/N` が入る） |
| `<html lang="en">` | 英語の教材：本文は Source Sans 3、画面の言葉は英語、品質チェックは英語の規格、TTS は `voxcpm2` |
| `<html data-theme="名前">` | テーマ（`--theme` が優先） |
| `<html data-mode="talk">` | URL に `?mode=` がなく、`deck-meta.offer.open` もモードを決めないときのモード（`talk`・`video`。以前のバージョンの `learn` は `talk` と読む） |
| `<html data-feedback-url="URL">` | 「フィードバックを送る」の宛先（既定 `https://github.com/egatari/egatari-studio/issues/new`）。GitHub の `/issues/new` なら `template=feedback.yml` を足す。`version` `browser` `os` `context`（言語・モード）を URL の引数として付ける |
| `<html data-feedback="off">` | `?` の一覧と発表者ビューにフィードバックのリンクを出さない（`DECK.FEEDBACK_URL = null`） |
| `<html data-favicon="off">` | タブのアイコンを入れない。既定では、組んだ教材（ふつうの build・`--portable`・`--play-only`）の `<head>` の先頭に、Egatari のマークを `<link rel="icon">`（data: URI）として入れる（明るい画面と暗い画面の色は 1 つの SVG に入れる。外へのリクエストはない）。スライドが自分の `<link rel="icon">` を持つなら、それを使い、何も足さない |
| `<html data-font="mincho">` | 本文を BIZ UDP明朝にする（`--font-sans: var(--font-mincho)`）。[国語](#国語kokugo) |

本文のクラス（色はすべてテーマから）：`.sub` 小見出し · `.big` 主要な式 · `.note` 補足（27px） · `.thm` 定理の枠 · `.box` 淡色の枠 · `.cols` 横並び · `.arrow` 中央の矢印の行 · `.fig` / `.figcap` 図とキャプション · `.cite` 出典（20px） · `.plot` `DECK.Plot` の箱 · `.readout .num` 桁をそろえた数 · `td.r` 右寄せのセル · `.term`、`.emph`、`.muted`、`.b` 色（意味は形式 §8.0）と太字 · `.tate` 縦書き · `.mincho` 明朝 · `.tcy` 縦中横 · `<ruby>` 振り仮名（[国語](#国語kokugo)）。

### ステップの属性

| 属性 | 意味 |
|---|---|
| `data-step="k"` | ステップ k（k ≥ 1）で現れる。ステップ 0 は入った直後に見えているもの |
| （スライドに何も書かない） | `data-step` も `data-from` もないスライドは、`.body > ul > li` と `.body > ol > li` が順にステップ 1, 2, … になる |
| `.concl` | 常に最後のステップ（`max + 1`）。ステップの指定は `[concl]` |
| `data-at="秒"` | そのステップの中で、秒だけ遅れて始まる（フェードと `.draw`） |
| `class="draw"` | SVG の線を描いていく（`pathLength="1"` が要る）。ステップはいちばん近い `data-step` の祖先、自分の `data-step`、なければ 0。0.7 秒。static のスライドでは、線は描き終わった形で出る（動かない） |
| `class="draw drawslow"` | 同じく 1.4 秒 |
| `data-from="k"`（パーツ） | パーツのステップ 1 をスライドのステップ k に合わせる（既定 1） |
| `steps="n"`（パーツ） | パーツのステップの数を上書きする |
| `data-id="ID"` | モーフの対応（[contract §8](contract.ja.md#8-モーフdata-morph)） |
| `id="ID"` / `data-mark="ID"` | `{mark:ID}` の目印（[contract §7](contract.ja.md#7-強調mark)） |
| `data-key`、`data-title` | build が付ける（スライドの id、タグなしの見出し）。書き手は書かない（形式 §8.0） |

### 数式

| 書き方 | 意味 |
|---|---|
| `\( … \)` / `\[ … \]` | 文中 / 別行の式。build で KaTeX が組む（`<script>` `<style>` `<svg>` `<textarea>` とコメントの中は対象外） |
| `\hlE{…}` `\hlT{…}` `\hlM{…}` | 式の一部を結論（`--emph`）/ 用語（`--term`）/ 既知（`--muted`）の色に |
| `\morph{ID}{…}` | 式の中のモーフの対応（= `\htmlData{id=ID}{…}`） |
| `\htmlId{ID}{…}`、`\htmlData{mark=ID}{…}` | 式の中の強調の目印 |
| `\htmlClass{名前}{…}` | 式の中に CSS のクラス。`\html…` はこの 3 つだけ許す |
| `macros.tex` | `\newcommand{\R}{\mathbb{R}}`、`\newcommand{\v}[1]{…}`、`\def\x{…}`。波括弧の入れ子は 3 段まで |
| `<script type="text/x-tex-macros">…</script>` | 同じ書き方のマクロを `deck.html` の中に |
| KaTeX のエラー | build が警告し、元の式を赤で出す（`.katex-error`）。品質チェックはエラーにする |
| パーツやスライドのスクリプトで `DECK.svgMath(…)` | 実行時にも KaTeX を埋め込む（マクロも同じ） |

### 埋め込み

| 書き方 | 意味 |
|---|---|
| `/*INCLUDE:ファイル*/` | ファイルの中身をそのまま入れる（作業フォルダ → `kit/` の順に探す）。そのフォルダの外を指すもの（`../`、絶対パス、シンボリックリンク）は警告して読まず、空にする |
| `{{FIG:名前}}` | `figs/名前.svg`（なければ作業フォルダの `名前.svg`）を埋め込む。id に `名前-` を前置し、width・height を外す |
| `{{JSON:ファイル}}` | `data/`（なければ作業フォルダ）の JSON を詰めて入れる。パーツの子の `<script type="application/json">` に置くと `this.data` で読める |
| `<m-名前 …>` | パーツ。教材の `components/名前/index.js`、なければパーツライブラリの写し `vendor/components/名前/<版>/index.js` を自動で読み込む |

`{{FIG:…}}`・`{{JSON:…}}`・`narration.md`・`timeline.json`・`macros.tex`・`audio/manifest.json` の中のファイルも、（シンボリックリンクをたどった先が）作業フォルダの中にあるときだけ読む。外なら警告（`refused: …`）して飛ばす。

### 素材（build で埋め込む）

| 参照 | 埋め込み方 |
|---|---|
| `<img src>`、`<source src/srcset>`、`<img srcset>`、`<video src/poster>`、`<audio src>`、`<track src>`、SVG の `<image href>` | `data:` URI |
| スライドの `<style>` と `style=""` の中の `url(…)`・`@import` | `data:` URI／取り込む CSS の中身（リンクや @import した CSS の中の `url()` はその CSS からの相対） |
| `<link rel="stylesheet" href="file.css">` | 中身を入れた `<style>` |
| `<link rel="icon">` などほかの `<link>` のファイル、`<script src="file.js">` | `data:` URI／中身を入れた `<script>` |

相対パスは作業フォルダから解決し、フォルダの外は読まない。`data:`・`blob:`・`#断片`・テンプレートの値（`${…}`、`{{…}}`）はそのまま。警告：`missing: …`（ファイルがない）、`refused: …`（作業フォルダの外）、`external: …`（素材の位置にある `http(s)` の参照。`<iframe>`・`<object>` を含む。そのまま残すので、オフラインでは出ない）。ふつうのリンク（`<a href>`）は触らない。`audio/manifest.json` の音声は `--embed-audio` のときだけ埋め込む。

<a id="スライドの鍵"></a>

### スライドの id

スライドは `id` で決まる（形式 §8.1：`^[A-Za-z][A-Za-z0-9_-]{0,63}$` に合い、教材のほかのどの id（目印・`\htmlId{…}` も）とも重ねない）。`npm run new` はどのスライドにも id を付ける。id のない教材には `npm run ids -- <教材>`。そのような教材も開いて直せるように、build は id のないスライドに見出しから決めた名前を id の代わりに使い、品質チェックが知らせる（`legacyIndex`）。重なりはエラーで、build は警告（`slide key: …`）し、後のスライドに `#2`、`#3`、… を付ける。決まった名前は section の `data-key` に書く（[約束事 §4](contract.ja.md#4-台本narrationmd)）。

## 台本（narration.md）

規範は形式の仕様 §8.1〜§8.3。

| 書き方 | 意味 |
|---|---|
| `## 見出し {#s-k3f9q2}` | その id のスライド（見出しの文字列は読む人のため） |
| `[0]` `[1]` … `[concl]` | そのステップの台本。続く行は同じステップ。ステップは 0〜999 で先頭の 0 なし（`[01]` はステップにならない） |
| `@x-<名前>-<欄> <値>` | ステップの中の拡張の行：そのステップのデータとして残す。表示も読み上げもせず、hash にも入らない |
| `Expert:` / `Novice:`（`E:` / `N:`、全角のコロンも可） | 話者の発言。話者のない行は Expert（1 人モード）か、前の発言の続き |
| `{cue}` | ステップの中の同期点。パーツの `cues(k)` と順に対応 |
| `{mark:ID}` | この言葉で目印に下線を引く |
| `{mark:ID\|効果}` | 効果：`underline`、`circle`、`box`、`spot`、`laser` |
| `{mark:ID\|効果\|hold=2}` | 2 秒で消す（既定はステップの終わりまで。`laser` は 1.5 秒） |
| `{mark:clear}` | その時点で、そのステップの強調をすべて消す |
| `{φ\|ファイ}` | 表示は φ、読みはファイ |
| `# 題名` | 無視する |
| `<!-- … -->` | 行全体のコメント（複数行も可）。無視する |
| 同じステップを 2 回書く | 後のものが効く |

build は、どのスライドにも合わない `##`（品質チェックではエラー）、決まった書き方でないステップの番号、規則に合わない `{#id}`、無い効果の名前、スライドに無い目印を警告する。

## 長さ（timeline.json）

`dur = override.dur ?? max(anim, 音声 ? lead + 音声 + pad_after : max(hold, 強調の終わり + pad_after))`（規範は形式の仕様 §5.5 と §8.0。[contract §5](contract.ja.md#5-タイムライン)）。

| `"スライドの id:ステップ"` の中の欄 | 既定 | 意味 |
|---|---|---|
| `dur` | — | 長さを固定（秒）。`lead + dur` を超えた音声は切る |
| `hold` | 1.2 | 音声のないステップの長さ |
| `lead` | 音声があれば 0.25、なければ 0 | 音声の前の無音 |
| `pad_after` | 0.6 | 音声（か最後の強調）の後の間 |

例：`{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`。直したら build し直す。

組み込みの長さ（`DECK.T`、秒）：フェード 0.45、線 0.7、ゆっくりの線 1.4、線の遅れ 0.1、スライドの切り替え 0.35、モーフ 0.9。強調（`DECK.MK`）：描く 0.5、消える 0.3、音声がないときの間隔 0.9、`laser` 1.5。`prefers-reduced-motion` のとき（`?mode=video` を除く）は、どのステップも最終状態で見せる。

## テーマ

決め方：`--theme` > `<html data-theme>` > `default`。名前は、作業フォルダからの相対パス → `<deck>/themes/<名前>/` → 自分のテーマのフォルダ（`EGATARI_THEMES` のフォルダを順に、その後に `~/.egatari/themes` があれば）→ 同梱の `themes/<名前>/` の順に探す。フォルダには `tokens.css` が要る。`EGATARI_THEMES` はフォルダの並びで、区切りは OS のもの（`:`、Windows は `;`）。ないフォルダは警告して飛ばす。`theme.json`・`tokens.css`・ロゴ・親のテーマ（`extends`、何段でも）は、読む前に、実体のパスがそのテーマの許した根の中にあることを確かめる：教材のテーマなら作業フォルダ、パーツライブラリのテーマなら `themes/`、自分のテーマのフォルダのテーマならそのフォルダ（実体のパスを 1 回だけ求める。`~/.egatari/themes` はシンボリックリンクでもよい）、`--theme` で選んだものならそのテーマのフォルダ。親は自分のテーマのフォルダと `themes/` からも取れる。`"extends": "default"` は、テーマのフォルダに自前の `default` がなければ同梱の `default`。外なら警告（`refused: …`）して読まず、教材のテーマなら `default` にする（[format spec](https://github.com/egatari/egatari-spec) §11）。教材（か `extends`）が選んだテーマがどこにもなければ誤りにせず、`theme not found: "<名前>" …` と警告して `default`（親はなし）で組む。`--theme` で選んで見つからないものは誤り。編集アプリは `EGATARI_THEMES`・`~/.egatari/themes` を見ない：そこではテーマのフォルダを 1 つ選び（「テーマを読み込む…」→「フォルダを選ぶ…」。読むだけ）、それが同じ順と同じ決まりで自分のテーマのフォルダの代わりになる（[編集アプリ](editor.ja.md)）。フォルダを選べないブラウザも含め、どのブラウザでも ZIP ファイルからテーマを読み込める（「テーマを読み込む…」→「ZIP ファイルを選ぶ…」）：そのテーマは「自分のテーマ」としてブラウザに保存され、同じ場所で同じ決まりで読む（フォルダと自分のテーマに同じ名前があれば、あとから選んだ・読み込んだほう）。選ばず、教材の `themes/` にもなければ、テーマが自分のテーマのフォルダにだけある教材はこの警告を出す。Egatari ファイル（`.ega.html`）は、自分のテーマのフォルダのテーマを教材の `themes/<名前>/` として入れるので、どこでも同じテーマで組み直せる。`extends` が 16 段より深ければ誤り。

| `theme.json` の項目 | 意味 |
|---|---|
| `extends` | 親のテーマ：その `tokens.css` を先に置く（このテーマの隣 → 自分のテーマのフォルダ → `themes/` の順に探す） |
| `logos` | 画像のファイル（テーマのフォルダから。png・jpg・svg・webp）。すべての表紙に入る。書かなければ `extends` の親のロゴを引き継ぐ（`"logos": []` で消す） |
| `name` | 説明用 |
| `version` | テーマのバージョン（`themes.lock.json` に載せた同梱のテーマ。下の「テーマのバージョン」） |
| `fonts` | テーマが選ぶ字体。Studio がファイルに入れられる一覧（下の「字体」）から：`{"body": "Zen Maru Gothic", "heading": "Zen Maru Gothic"}`。組み立てはその字体を埋め込む（教材が使う字を含む分割ファイルだけ）。CSS（`--font-sans`）はテーマの `tokens.css` が書く。テーマやスライドの CSS が一覧の字体を名指しても、その字体を埋め込む |
| `look` | テーマが使う、見出し・表紙・結論の行の決まった形（`{"heading": "band", "cover": "left-bar", "concl": "left-rule"}`。`kit/core/theme-shapes.mjs`。結論の行は `left-rule`・`rounded`・`rule`（枠も地もなく、上に `--emph` の線）のどれか）。同梱のテーマは形ごとの CSS を `tokens.css` の `/* look <key>: <id> */` と `/* /look */` の間にそのまま写す（`tools/test-themes.mjs` が照らす）。組み立ては読まない |
| `metrics` | 品質チェックと書き手のツールのための、テーマの体裁の寸法（`"v": 1`。下の表）。`extends` の親から項目ごとに引き継ぎ、書かない項目は既定。描くのには使わない（[契約](contract.ja.md) §12） |

`metrics` の項目（1280×720 の舞台の px。数で、小数も可）。既定は今の `kit/layouts.css` で、そこから導く限りは今までの検査の数（565・680・1236・1162・124・44）。余裕（6・4）は検査の方針で、テーマの値ではない。CSS でこれらの箱を動かすテーマは宣言するとよい（同梱と公式のテーマ庫のテーマは宣言しなければならない）。`node tools/theme-metrics.mjs measure <テーマ>` が貼る塊を出す。

| 項目 | 意味 | 既定 | 検査での使い方 |
|---|---|---|---|
| `body.left`・`body.right`・`body.top` | 横組みの `.body` の箱（左・右は端からの距離） | 48・48・122 | 右の限り `1280 − body.right + 4`（`bodyRight`） |
| `body.floor` | 結論の行がないとき（`noconcl`）本文が下りてよい限り（ページ番号の上） | 680 | `noconcl` の下の限り |
| `body.line` | 本文 1 行の高さ。知らせと修正依頼の「およそ n 行」だけに使う | 46 | 知らせ |
| `concl.top`・`concl.height` | 横組みの結論の行の箱 | 571・72 | 下の限り `concl.top − 6`（`bodyBottom`） |
| `tate.rule` | 縦組み（`layout-tate`）の見出しの罫の x | 1166 | 右の限り `tate.rule − 4`（`tateBodyHead`） |
| `tate.conclRight`・`tate.left` | 縦組みの結論の列の右端・結論がないときの本文の左 | 120・48 | 左の限り `tate.conclRight + 4`（`bodyConclCol`）／`tate.left − 4`（`bodyLeft`） |
| `tate.floor` | 縦組みの本文の地の限り | 680 | `layout-tate` の下の限り |

数でない値・範囲の外（x は 0〜1280、y は 0〜720）・知らない項目・`v` が 1 でない・互いに合わない値（本文の上端が結論の行より下、本文の幅が 320px より狭い、など）は組み立ての警告（`theme-metrics: …`）で、親の（なければ既定の）値を使う。品質チェックは宣言とテーマが描く箱を比べる（下の `themeMetricsDrift`）。

**同梱のテーマ。** 新しい教材は 8 つのテーマから選ぶ。画面では和色の名前で、何に向くかを小さく添える：藍（`default`。研究・講義）、墨（`sumi`。報告・提案）、国語（`kokugo`。国語・和の題材）、常盤（`tokiwa`。理科・自然・学校）、江戸紫（`murasaki`。研究・一般の講演）、焦茶（`kogecha`。人文・歴史・地域）、浅葱（`asagi`、字体は Zen Maru Gothic。小学校・広報・案内）、生成（`kinari`、名前は仮。暖かい紙の地・深い墨・強調 1 色、見出しは Fraunces と BIZ UDP明朝、結論の行は線だけ。講演・読み物）。一覧と向きは `kit/core/themes-list.mjs`。`business` は新しい教材には選べない（編集アプリの一覧・`npm run new`）。同梱のままなので、それを書いた教材・そのバージョンを記録した教材は前のとおり組めて再生できる。代わりは `sumi`。8 つとも `default` の役割の色と箱（品質チェックの限り）は同じで、変えるのは色・線・帯・角・字体だけ。テーマの CSS は組み込みの規則と同じ以上の詳細度で書く（`.slide h2` は 0,1,1）。`:where()` で包まない（詳細度が 0 になり、一部の宣言だけが組み込みの規則に負ける。見出しの帯の上に見出しの濃い字が乗る、など）。`node tools/test-themes.mjs` が同梱のテーマごとにサンプルの教材を組んで確かめる：品質チェック（`textContrast`・`secHeading`・`fontNotEmbedded`・寸法の警告がない）、字と地のコントラスト 4.5:1（役割の色と `--bg`、結論の行と `--concl-bg`、章の扉、表紙の題、見出しとその地）、色覚の模擬（Machado ほか 2009、強さ 1.0）で `--emph` と `--term` の差が 3 色型・1 型・2 型で ΔE*ab 35 以上・4 つの型で ΔE00 20 以上、`--emph` と `--fg` が 1 型で ΔE00 20 以上、`--lit` と `--emph` の差が `--emph` と `--term` と同じ線（`--lit` は輪郭線と一緒に描くので、`--bg` とのコントラストは測って表に出すだけで求めない）、同梱のどのテーマも自分の `tokens.css` で `--lit` を宣言すること、パーツの絵の暗いバージョンの色（`tools/part-thumbs.mjs` の `DARK`。暗い地の役割の色はここだけで、同梱のテーマに暗いバージョンはない）の `--lit` が地と 3:1 以上・`--emph` と 4 つの型で ΔE*ab 35 以上、同梱のどのテーマも 11 の物の色 `--obj-*` を自分の `tokens.css` に 16 進で宣言し、どれも OKLCH で名前どおりの色であること（色相の窓は red 15–45°、orange 50–80°、yellow 85–115°、green 125–165°、blue 235–275°、purple 285–335°、pink 340–15°で、どれも鮮やかさ 0.10 以上。brown は色相 40–80°・明るさ 0.35–0.60・鮮やかさ 0.04–0.12。white は明るさ 0.95 以上、black は 0.32 以下、gray は 0.50–0.75 で、3 つとも鮮やかさ 0.02 以下）、隣り合う色の名前（red–orange、orange–yellow、yellow–green、green–blue、blue–purple、purple–pink、pink–red、brown–orange、brown–red、gray–white、gray–black）が 3 色型で ΔE00 20 以上（`--emph` と `--term` と同じ線。物の色にはいつも名前か頭文字を添えるので、色覚の模擬は求めない）、`--bg` とのコントラストは測って表に出すだけ、ペンの色（下）。 量の色の段（#200）も確かめる：同梱のどのテーマも `--ramp-1` … `--ramp-5` を自分の `tokens.css` に 16 進で宣言し、OKLCH の明るさが段ごとに 0.05 以上下がり、`--ramp-5` が `--bg` と 3:1 以上であること。

CSS の順：build は `<style id="deck-base">` に、字・KaTeX・`kit/base.css`・`kit/layouts.css`・テーマの `tokens.css`（親のテーマから順に）・`kit/latin.css`（`lang` が日本語でない教材だけ）の順に書く。テーマは体裁の CSS の後なので、同じ詳細度のテーマの規則は体裁の規則に勝つ（例：`.cover h1{top:260px}`、`.body{left:96px;right:96px}`）。`html` を前に付けなくてよい。そうしたテーマにも、色の変数の意味（[契約](contract.ja.md) §12）と品質チェックの色の検査はそのまま効く。組み立ての口（コマンド、`--dev` と開発サーバー、`--portable`、`--play-only`、編集アプリ）はどれも同じ。

| 変数 | 意味 |
|---|---|
| `--base` | 基調色。ほかの色は `themes/default/tokens.css` でここから導く |
| `--emph-hue` | `--emph` の色相：宣言したテーマは `--emph` が `oklch(0.52 0.21 <色相>)` になる（`kokugo` は 38）。`default` は宣言せず、`--emph` を `#BE3012` に決めている（1.1.0 から） |
| `--fg` `--bg` `--title` `--term` `--emph` `--muted` `--line` `--rule` | 文字・背景・見出し・用語・結論・既知・細い線・見出しの下線 |
| `--lit` | 光と、光が照らすもの（太陽・灯り・月の明るい側）。塗りの色で、字の色には使わない。いつも `--fg` か `--muted` の輪郭線と一緒に描く（format spec §8.4）。同梱のテーマではどれも暖かい黄（`default` は `#F5B800`、1.3.0 から）。明るい地の上では 1.4〜1.8:1 ほどなので、形は輪郭線が見せる。使うパーツは、ほかの役割から作った予備の値を付ける（`var(--lit, …)`） |
| `--obj-white` `--obj-black` `--obj-red` `--obj-green` `--obj-yellow` `--obj-blue` `--obj-brown` `--obj-purple` `--obj-pink` `--obj-orange` `--obj-gray` | 物の色：色そのものが内容である色（袋の中の赤い玉、青のリトマス紙、青信号）。11 の基本色名（format spec §8.4）。色そのものを見せるところだけに使う：図の系列は `--series-1` … `--series-4`、意味は上の役割。色だけで伝えない：物の上か横に名前か頭文字（「赤」、"R"）を添え、`--obj-white`・`--obj-black` と地に近い色の形には `--fg` か `--muted` の輪郭線を付ける。使うパーツは予備の値を付ける。予備はその名前の色をじかに書いてよい（`var(--obj-red, #E0242B)`）。間の色は物の色どうしの `color-mix()` で作る。同梱のテーマはどれも 11 色を持つ（`default` は 1.4.0 から `#FFFFFF` `#222222` `#E0242B` `#2E9E44` `#F5D90A` `#1E6FD9` `#8B5A2B` `#8E44AD` `#F27BB0` `#F28C1A` `#8C8C8C`。`sumi`・`kokugo`・`tokiwa`・`murasaki`・`business` も同じ値。`kogecha` は少し鮮やかさを抑え、`asagi` は少し明るい） |
| `--complement` `--accent2` `--base-tint` `--base-wash` `--comp-tint` `--term-tint` `--emph-tint` | 導かれる色と淡色（`--term-tint` は `.thm`、`--base-wash` は `.box`、`--emph-tint` は今は本体では使わない。既存のテーマと教材が動くように残してある） |
| `--series-1` … `--series-4` | 図の系列の色 |
| `--ramp-1` … `--ramp-5` | 量の色の段（format spec §8.4、#200）：量（ヒートマップ・密度・速さ）の低→高の 5 段。基調色の色相で、OKLCH の明るさが段ごとに下がり、`--ramp-5` は `--bg` と 3:1 以上。分類や意味には使わない。同梱のテーマはどれも持つ（`default` 1.5.0 から） |
| `--scrim`、`--scrim-strong` | 背景の画像の上の字の下に敷く、地の色の半透明の地（#141。`kinari` 1.0.0） |
| `--preview-opacity` | 先のステップを薄く見せる：まだ来ていないステップの不透明度（0.45。プロジェクターで読めるよう、テーマで 0.45〜0.5 の範囲で変えられる。`--lecture-dim` は同じものの別名） |
| `--font-sans`、`--weight-body` | 字の種類、本文の太さ |
| `--kicker-size`、`--kicker-color`、`--kicker-weight` | 肩見出し（見出しの上の短い言葉）：字の大きさ（24px）、色（`--muted`）、太さ（700） |
| `--cover-bg`、`--logo-h` | 表紙の背景、ロゴの高さ（128px） |
| `--sec-bg`、`--sec-fg` | 扉の背景（`--base`）と文字（白） |
| `--concl-bg` | 結論の行の背景（`default` は 1.2.0 から `#F5F5F5`。前は透明） |
| `--marker` | `.body` の箇条書きの印（`--term`） |
| `--bar`、`--bar-h` | 進み具合の帯の色（`--emph`。自動再生のときは `--term`）と高さ（3px） |
| `--stage-bg` | スライドのまわりの色（#2f2f2f） |
| `--cap-size`、`--cap-bottom`、`--cap-side`、`--cap-max-lines` | 字幕の字の大きさ（27px）、下端からの距離（18px）、左右の余白（96px）、1 まとまりの行数の上限（3） |
| `--cap-rate` | 手で送るときの字幕の読む速さ（字/秒。既定 ja 7、en 15。`DECK.captionRate` でも変えられる） |

**テーマのバージョン。** 教材の見た目を変える同梱のテーマは `theme.json` の `version` を上げ、前のバージョンは `vendor/themes/<名前>/<版>/` に残す。バージョンごとの同一性の hash と変わった色は `themes.lock.json` に書く（`npm run themes:check` が写しと固定を照らす。`npm test` に入る）。最初の例が `default` 1.1.0（`--emph` `#C50516` → `#BE3012`、`--muted` `#6E6E6E` → `#5C5853`）で、1.0.0 は Studio 0.4.6 までの `default`。`business` 1.0.1（`--emph` `#C2410C` → `#BA3C05`）は、`--emph-tint` の地の上の字が 4.5:1 に届くように橙を少し濃くした。`default` 1.2.0 は、結論の行を左の `--emph` の縦線・太字・決まった位置・淡い灰の地（`--concl-bg` `#F5F5F5`）で示し、枠の中央揃えをやめて左揃えにした（位置と高さは同じ。縦組み `layout-tate` は枠のまま）。`default` 1.3.0 と、`business`・`kokugo`・`sumi`・`tokiwa`・`murasaki`・`kogecha`・`asagi` の 1.1.0 は役割 `--lit` を足した（今までの色は変わらない）。`default` 1.4.0 とほかの 1.2.0 は物の色 `--obj-*` を足した（今までの色は変わらない）。この色にした理由は [themes/default/README.ja.md](../themes/default/README.ja.md)。テーマのフォルダの最上位の文書（`README*`・`LICENSE*`・`*.md`）はテーマの一部でない：組み立ては読まず（ロゴに書いても）、hash に入れない（仕様 §6）。利用者のテーマや教材のフォルダの `themes/` のテーマを Egatari ファイルに入れるときは、その `LICENSE*` を一緒に入れる（`themes/<名前>/LICENSE…`。展開でフォルダに戻る）。テーマの使用条件（書体・機関のロゴ）は資源を配り直す先に付いていく必要があるため（§3.3）。`README*` とほかの `*.md` は入れない。パーツと同じく、教材の色を黙って変えない：Egatari ファイルはテーマごとの名前・バージョン・hash を記録し（`index.themes`）、中の `egatari.json` にバージョンを固定する（`"themes": {"default": "1.1.0"}`。これを持たない前の Egatari ファイルを展開すると、記録の hash が合うバージョンに固定する）。前のバージョンに固定したフォルダを組むと、そのバージョンの写しで組み、変わる色を挙げて `theme pinned: …` と警告する。`--update-themes`（または固定を今のバージョンにする）で更新する。固定のないフォルダは今のバージョンに付いていく。編集アプリは、開いた Egatari ファイルを記録したバージョンのテーマで組み直し、「テーマを更新」を出す（[編集アプリ](editor.ja.md)）。`default` を継ぐテーマも、固定した `default` を使う。Egatari ファイルは、エディタのバージョンによらず、埋め込んだテーマの CSS のまま再生する。

字：日本語の教材（`lang` が `ja` か、ない）は BIZ UDPゴシックを埋め込む。ほかの言語は Source Sans 3 を埋め込み、U+024F より後ろの字だけを BIZ UDPゴシックで補う。埋め込むのは使っている字を含む分割ファイルだけ（`fonts/*.ttf` と uv があれば使っている字だけ）。BIZ UDP明朝は、教材が明朝を使うときだけ、同じ字を埋め込む：教材・テーマ・使っているパーツのどれかに `var(--font-mincho)` がある、`class="mincho"`、`<html data-font="mincho">`（`kit/layouts.css` の `--font-mincho` の定義は数えない）。`--font-mincho` は `:where(:root)` で決めてあるので、テーマで上書きできる。テーマ `kokugo`：本文は明朝、基調色は藍、強調は朱、地は生成り、字幕は BIZ UDPゴシック（`--font-cap`）。

英語の斜体：Source Sans 3 の斜体は、教材が斜体で出す字があるときだけ埋め込む（`<em>`・`<i>`・`<cite>`・`<dfn>`・`<var>`、`style` 属性の `font-style: italic`、斜体を書いた教材の `<style>`、斜体の字を書くパーツのコード。パーツの数式の記号（KaTeX_Math）は数えない）。その字には 400 の斜体、太字の中（`<b>`・`<strong>`・見出し・`<th>`・結論の行・`.sub`）の斜体の字にだけ 700 の斜体を、どちらもその字を含む分割ファイルだけ入れる。斜体の字のない教材には入れない。日本語の教材ではラテン文字だけを数え、`<em>`・`<i>`・`<cite>` の中のラテン文字を Source Sans 3 の斜体で出す。

本文の字体を一覧の日本語の字体にしたテーマ（`asagi`：Zen Maru Gothic）では、BIZ UDPゴシックはその字体が持たない字だけを埋め込む。

ファイルに入れられる字体は決まった一覧で、どれも SIL Open Font License、`@fontsource` のもの（`kit/core/build-core.mjs` の `FONT_LIST`）。ファイルに入るのは教材が選んだ字体だけなので、一覧が長くてもファイルは重くならない。選ぶのはテーマの `theme.json` の `fonts` か、テーマ・スライドの CSS で字体の名前を書くこと。

| 用途 | 字体 |
|---|---|
| 日本語 | BIZ UDPゴシック（既定）、BIZ UDP明朝、しっぽり明朝（Shippori Mincho）、Zen Maru Gothic、Klee One（400 と 600） |
| 英語 | Source Sans 3（既定）、Source Serif 4、Andika、Atkinson Hyperlegible Next（どれも斜体あり）、Fraunces（400 と 700。`kinari` の見出し） |
| 等幅 | Source Code Pro |

npm の包み `egatari` についてくるのは既定の字体（BIZ UDPゴシック・BIZ UDP明朝・Source Sans 3）と、同梱のテーマが使う字体（`asagi` の Zen Maru Gothic、`kinari` の Fraunces）で、同梱のテーマはどれも `npx egatari` だけで組める。教材の CSS か自分のテーマだけが名指せるほかの字体（しっぽり明朝・Klee One・Source Serif 4・Andika・Atkinson Hyperlegible Next・Source Code Pro）は別の包み `@egatari/fonts-extra` にあり、`egatari` と一緒に入れる（`npm i -D @egatari/fonts-extra`、または `npx -p egatari -p @egatari/fonts-extra egatari …`）。組み立ては `egatari` の包みと今いるフォルダからそれを探す。ないと、組み立ては `fonts-extra: …` と知らせ、品質チェックは入れ方つきのエラー `fontsExtraMissing` を出す。黙ってほかの字体にはしない。リポジトリの checkout にはどの字体もある（`npm ci`）。

CSS はほかの字体（端末に入っている字体など）も書けるが、ファイルには入らない。開く端末ごとに、その字体か、並びの次の字体で出る。品質チェックは `fontNotEmbedded` で名前を挙げて知らせる（教材に 1 回。スライドの字の `font-family` の計算した値の最初の名前が、埋め込んだ字体でも総称でもないもの）。オフライン版のエディタ（`editor.html`）が持つのは BIZ UDPゴシックと Source Sans 3 だけで、ほかの字体を選んだ教材はその字体なしで組み、知らせる。

| 変数 | 意味 |
|---|---|
| `--font-mincho` | 明朝の字（`"BIZ UDPMincho", "Hiragino Mincho ProN", "Yu Mincho", serif`） |
| `--font-cap` | 字幕の字（既定は `--font-sans`） |

## パーツ

パーツの一覧と受け取る値は [vendor/components/CATALOG.md](../vendor/components/CATALOG.md)（既定のバージョンの各 README の frontmatter から `node tools/catalog.mjs` が作る）。パーツは [egatari/components](https://github.com/egatari/components) のもの：Studio はそのリリースの写しを `vendor/components/sha256/<hash>/` に持ち、`components.lock.json` で固定する。`npm run components:update -- vX.Y.Z` でリリースを取り込み（ネットワークを使うのはこれだけ。tarball をリリースの `manifest.json` と照らし、取り込んだバージョンはすべて残す）、`npm run components:check` で写しと固定を照らす（npm test に入っている）。新しいパーツの提案は [egatari/components の Issue](https://github.com/egatari/components/issues/new?template=proposal.yml) へ。パーツの書き方（`DECK.define`、`DECK.MotionElement`、`static steps`、`static props` の `type: number | bool | json | string`、`mount`、`duration`、`cues`、`render`）は [contract §3](contract.ja.md#3-パーツweb-components) と [studio: parts](../skills/studio/references/parts.md)。

パーツが使える `DECK` のツール：`el(tag, attrs, parent)`（SVG。`var()` の色は `style` に回す）、`mtext(parent, x, y, "*x*_0", attrs)`、`svgMath(parent, x, y, tex, {size, anchor, color, w, h})`、`Plot(box, {xr, yr, xt, yt, xf, yf, xl, xl2, yl, noY, m})`（`.x() .y() .d(f, a, b, n) .poly(pts) .clip`）、`prog(t, start, dur)`、`lerp`、`ease`、`clamp01`、`color(名前)`。

**スライドへのリンクと目次。** `<a href="#<スライドの id>">` と `<a href="#<スライドの id>:<ステップの鍵>">` は、スライドかそのステップへのふつうのリンク（スクリプトなし。Core の文書に入れてよい）。実行系は文書の中でたどり、「戻る」を出す（[contract §9](contract.ja.md#9-スライドへのリンク)）。id は `npm run ids` が付けたものを使う。**`m-menu`** はそのリンクを札の格子に並べる（題・副題 `data-sub`・丸の字 `data-icon`・このセッションで見たスライドの「見た」の印・`per-step` でステップごとに出す）：[m-menu README (1.0.2)](../vendor/components/sha256/0ed29166621d8a7095e712b641079560668241671157578fd76c57d0767d6c6d/README.md)。サンプルは [`examples/kokugo-kanbun`](../examples/kokugo-kanbun) の 2 枚目。スライドの中のリンクは `--term` の色で下線を引く。

### 国語（kokugo）

国語（漢文・古文・現代文）の授業のためのもの。サンプルは [`examples/kokugo-kanbun`](../examples/kokugo-kanbun)（テーマ `kokugo`）。

- **縦書き**：`.body` の中の `<div class="tate">…</div>` は `writing-mode: vertical-rl` で、本文の高さいっぱいに右から左へ列を並べる（段落の間は左に空ける。`p.indent` で字下げ）。`.tcy` は 2 桁の数字などを縦中横にする
- **縦組みのスライド**：`<section class="slide layout-tate">` はスライド全体を縦に組む。`<h2>` は右端の縦の 1 列（1166〜1232px、天 48px から天付き）で、テーマの見出しの下線は列の左の縦の罫になる。列は折り返さない（全角でおよそ 14 字。長いと品質チェックが指摘する）。`.body`（148〜1138px、48〜664px。`noconcl` なら左は 48px から）は `writing-mode: vertical-rl` で、段落と箇条書きは右から左へ列を進め、`.tate` の塊は本文いっぱいに組む。本文の中のパーツ・図・表（`p`・`ul`・`ol`・`.sub`・`.note`・`.arrow`・`.tate`・`.box`・`.thm`・`h3`・`blockquote` 以外の直下の要素）は、自分の箱を測って描くので横組みのまま本文の幅いっぱいに置く。縦書きはパーツの指定で（`m-kobun tate`・`m-gendai tate`。`m-kanbun` はいつも縦書き）。`.concl` は左端の縦の列（48〜120px。およそ 19 字）。ページ番号は右下のまま（見出しの列の下）。変わるのは CSS だけで、スライドの id・字幕・Egatari ファイルの読める層は、これまでどおり見出しの字から作る。サンプルは [`examples/kokugo-kanbun`](../examples/kokugo-kanbun) の現代文のスライド、試験は `tools/test-layout-tate.mjs`
- **ルビ**：`<ruby>漢<rt>かん</rt></ruby>`。`rt` は 0.5em で、品質チェックは字の大きさを数えない。縦書きでは右に付く
- **明朝**：`.mincho`、`<html data-font="mincho">`、または `--font-sans: var(--font-mincho)` にするテーマ（`kokugo`）
- **`m-kanbun`**：縦書きの漢文。1 行が 1 列。字の後ろに `(送り仮名)`、`[返り点]`（`レ`・`一二三四五`・`上中下`・`甲乙丙丁`・`天地人`・`一レ`・`上レ` など。`レ` だけは括弧なしでもよい）、`{振り仮名}`、`{=かな}`（書き下し文で平仮名にする字。`不{=ず}`）、`{-}`（置き字。読まない）、`(右|二度目)`（再読文字。`未(ダ|ず)`）、`-`（竪点）、`、` `。`。ステップ：白文 → `kunten`（返り点は左下、送り仮名は右下）→ `order`（訓読の順に字を照らし、上へ戻るところに弧。パーツライブラリ v1.4.0 から句（列）ごとに 1 ステップで、返り点や再読文字で前の列へ戻ると、そこから別のステップ。`order-by="all"` なら読む順の全体を 1 ステップにし、`cues(k)` は 2 列目からの各列の読み始め）→ `kaki`（書き下し文を左に）。規則と詳しいことは [m-kanbun README (1.6.0)](../vendor/components/sha256/0c02494c234498ef3a20d9e605f886425223639dbf94e20a27b97c82d9ada188/README.md)
- **`m-kobun`**：古文を語に切り（`春[名]/は[係助]/…`）、品詞で色を分けて 1 文ずつ出し、最後のステップで現代語訳（`= …` の行）を並べる。助動詞 `[助動・基本形・意味・活用形]` を押す（または Enter）と、パーツの中の表から活用表と意味の札を出す（ネットワークを使わない。中身は文字だけ）。札は発表の操作で `DECK.seek(i, k, t)` の外：ステップに入るたびに（同じステップに入り直すときも）閉じ、動画のモードでは開かず、印刷に出ない。[m-kobun README (1.0.2)](../vendor/components/sha256/c3aaa6dccaefe1e372d0758a67ea8e95242629bb9fb55294f1d43633ae60f293/README.md)
- **`m-gendai`**：現代文。`__傍線__`、`==二重傍線==`、`{語句|_A,#名前}` と `{これ|>名前}`（指示語から指す先への矢印）、段落の `@主張#p3`・`@具体例#p1>p3`・`@対比#p2~p1` を役割の枠で囲み線でつなぐ。横書きか `tate`。[m-gendai README (1.0.2)](../vendor/components/sha256/286d6f3d2281ccd5b2f3cee91e1eb6357905cc7846b3c2032230bdde97b5bd77/README.md)

## 発表

### URL の引数

| 引数 | 意味 |
|---|---|
| `?mode=talk` | 既定：後のステップは隠し、今のステップはフェードで出す |
| `?mode=talk&preview=1` | 先のステップを薄く見せる：全部見せ、後のステップは薄く（`--preview-opacity`、既定 0.45。`data-preview="none"` の要素と `preview: "none"` を宣言したパーツは隠したまま）、今のステップとその前は濃いまま、今のステップに目印は付けない（蛍光ペンも `.cur` クラスもなし）。強調は最終状態 |
| `?mode=learn` | 以前のバージョンの自習のモード。Egatari Player 1.4.0 でなくなった：`?mode=talk` と読む（ツールバーに再生がある。[再生と進行状況](#再生と進行状況)） |
| `?mode=video` | 動画のエクスポート用：発表のツールもツールバーも出さない。reduced-motion を無視する。人が開いたとき（エクスポートやツールが撮る自動操作のブラウザでないとき）は、真ん中に **再生** のボタンを 1 つだけ出し、押すとタイムラインに沿って最後まで流れる。ほかの操作はない（Player P1）。`offer.open.mode` が `video` のときも同じ |
| `?captions=1` | 字幕を出して開く（`s` と同じ）。`?mode=video` では字幕はこれでだけ出る（動画のエクスポートで字幕を焼き込める） |
| `?capsize=s` / `m` / `l` | 字幕の大きさ（22 / 27 / 34px）。覚えた大きさより優先。`?mode=video` では効かない |
| `?presenter=1` | 発表者ビュー（`p` で開く） |
| `?view=follow` / `?view=next` | 内部用：発表者ビューの中の画面 |
| `#N` | N 枚目（1 始まり）で開く。移動すると書き換わる |
| `#<スライドの id>` / `#<スライドの id>:<ステップの鍵>` | そのスライド（ステップ 0）かステップ（`0`・`1`・… か `concl`）の最終状態で開く（[contract §9](contract.ja.md#9-スライドへのリンク)） |
| `?embed=1` | iframe の中で：教材を読み込んで命令を受けられるようになったら、親へ `{egatari:"ready", version, docId, sourceSha256?, timeline}` を 1 度送る（初めの `position` より前。`version` はプレーヤーのバージョン、`docId` は作業フォルダの組み立てでは `null`、`sourceSha256` は Egatari ファイルだけ、`timeline` はステップごとに `{slideIndex, slideKey, stepKey, slideTitle, dur}`）。ステップが変わるたびに `{egatari:"position", slideKey, stepKey, t, cause}` を送り、親からの `{egatari:"links", follow}` を聞く。親は `ready` を受けたらすぐに命令を送ってよい。送り先の origin は `*`。命令と知らせの全体は[埋め込み](#埋め込み) |
| `?links=0` | `?embed=1` と一緒に：スライドへのリンクで動かず、代わりに `{egatari:"linkRefused", slideKey, stepKey}` を送る |
| `?layout=slides` / `flow` / `split` | スライドだけ・本だけ・スライドと本を並べて開く（[スライドと本](#スライドと本)）。`pages` は今は本をスクロールで開く。この端末で覚えた並べ方より優先。`?embed=1` では親が `{egatari:"layout", id?, layout}` を送ってもよく、同じ形で今の並べ方を答える |

### キー

| キー | すること |
|---|---|
| → ↓ Space PageDown | 次のステップ |
| ← ↑ PageUp | 前のステップ（最終状態で見せる） |
| Shift+→ / Shift+↓、Shift+← / Shift+↑ | 次 / 前のスライド（ステップ 0） |
| Home / End | 最初 / 最後のスライド |
| 数字＋Enter | そのページへ（再生中ならそこから再生を続ける） |
| f | 全画面（ブラウザに要素の全画面があるとき。iPhone の Safari や、全画面を許さない枠の中では、帯に全画面のボタンを出さず、キーの一覧にも f を載せない。ブラウザが断ったら「全画面にできませんでした」） |
| p | 発表者ビュー（もう一度 p で閉じる。発表者ビューでは Esc か p で閉じる。全画面のときは全画面をやめるだけ） |
| a | 今のステップから再生 / 一時停止（音声があれば流す）。一時停止してもう一度再生すると同じ所から続く。移動のキーで止まる |
| < / > | 再生速度を遅く / 速く（0.75・1・1.25・1.5・2 倍） |
| l | 先のステップを薄く見せる（入／切） |
| b | 黒い画面（窓全体を真っ黒にする。隅に薄い知らせが 2 秒と、マウスを動かしたときに出る。もう一度 b・Esc・クリック・矢印・Space・PageUp/PageDown・Home/End で戻り、スライドは動かない。発表者ビューには「黒い画面中」と出て、そこで b を押しても本体を黒い画面にする・戻すことができる。発表者ビューの矢印・Space・PageUp/PageDown も黒い画面を終えるだけで、スライドは動かない） |
| s | 字幕の入り切り：今のステップの台本（表示用の文字）をスライドの下に出す |
| Shift+s | 字幕の大きさ：S → M → L（22 / 27 / 34px）。上に短く知らせ、最後に選んだ大きさを覚える（localStorage） |
| o | 一覧（矢印・Home/End で選び、Enter・Space・クリックで移る。Esc か o で閉じる） |
| r | 表示：スライド → スライドと本 → 本（本がなければ スライドと台本 → 台本で読む）。この端末に覚える。開発サーバーのプレビューでは使わない |
| x | レーザーポインター（マウスが 2 秒止まると消える） |
| d | ペン（筆圧に対応。線はスライドごとに残る） |
| v | 消えるペン（書き終えて 0.7 秒後から 0.5 秒で消える） |
| Shift+d | ペンの色：赤 → 青 → 黒。上に「ペンの色：青」と短く知らせる。ペンの色はテーマによらず決まった 3 色：カラーユニバーサルデザイン推奨配色の赤 `#FF4B00`・青 `#005AFF` と黒 `#000000`（白地との比 3.4・5.4・21。線の 3:1 を満たす。色覚の模擬で互いに ΔE*ab 61 以上）。`tools/test-themes.mjs` が同梱のどのテーマの地でも確かめる |
| Backspace / Shift+Backspace | ペンか消えるペンを使っている間：このスライド / 全スライドの書き込みを消す |
| Backspace / Alt+← | それ以外で、スライドへのリンクで来た後：リンクを押した位置へ戻る（左上の **戻る** ボタンとブラウザの戻るも同じ） |
| Tab / Shift+Tab | ツールバーのボタンを選ぶ（Enter / Space で押す。Esc でスライドに戻る） |
| Esc | ツールを解除、キーの一覧を閉じる |
| ? | キーの一覧（`server/dev.mjs` で開いたときは開発サーバーのキーも）。ファイルに書かれていれば、教材のファイルの情報（題名・作成者・著作権・ライセンス・クレジットの表示）も |

### ツールバー（開いたときに出て、その後はマウスを動かす・タップすると出る）

教材を開くと、ツールバーを 5 秒ほど見せる。その端末で初めてのとき（`localStorage` に覚える。使えないときは毎回）は、帯の上に出し方の 1 行「マウスを画面の下に動かす（タップする）と、ツールバーが出ます」（指で操る端末、`(hover: none)` では「画面をタップすると、ツールバーが出ます」）を添え（読み上げソフトには読ませない。キーボードでは Tab でツールバーに入れる）、ツールバーが隠れると消す。その後は、マウスを動かす（タッチの画面ではスライドをタップする。そのタップでスライドは進まない）と出て、動かさずに 2.5 秒たつと隠れる（ポインターがツールバーの上にあるとき・フォーカスがあるときは隠れない）。隠れている間は、左下の小さく薄いボタン「ツールバーを表示」で、クリック・タップ・キーボードで出せる（Tab で選べ、Enter でツールバーの最初のボタンにフォーカスが移る。クリック・タップではフォーカスはスライドのまま）。隠れたツールバーを出すタップと、取っ手のタップは、出すだけで、ツールバーのボタンを押したことにはならない。取っ手と出し方の 1 行は、動画・発表者ビューの中の画面・`embed=1&controls=0`（ツールバーも出さない）・親の `{egatari:"controls", visible:false}` の後・印刷では出ない。幅の狭い画面（縦に持ったスマートフォンなど）では、ツールバーは画面の幅に収まるように 2 行に折り返し、スライドは画面の幅に合わせて縮む。

ボタン：前へ、**再生** / **一時停止**、次へ、**再生速度**（前へ・次へと速さは再生の操作で、再生中に前へ・次へを押しても再生を続ける）、レーザーポインター、ペン、消えるペン（ペンの 2 つは右上の点が今の色。ペンの間は後ろに赤・青・黒の色のボタンが出て、押すとその色になる。選んでいる色は aria-pressed）、書き込みを消す（ツールによらずこのスライド）、一覧、先のステップを薄く見せる、字幕、**読み上げで聞く（音声ファイルにはなりません）**（ブラウザに音声合成があり、台本があって音声のないステップがあるときだけ。[読み上げで聞く](#読み上げで聞く)）、発表者ビュー、全画面、キーの一覧、どこかのステップの音声が TTS なら小さな札「AI 音声」（format spec §7.3）。Tab で帯に入れ（フォーカスがある間は隠れない）、Enter / Space で押すとフォーカスはそのボタンに残り、Esc でスライドに戻る。マウスで押したときはフォーカスを残さない。スライドの下に 44px 以上の余白があれば余白に、なければ下端に重ね、そのときはマウスが下のほうに来たときだけ出す。印刷と動画には出ない。

### 再生と進行状況

自習はスライドショーの再生で行う（Player P1）。別のモードだった `learn` は Egatari Player 1.4.0 でなくなり、`?mode=learn`・`offer` の `learn`・埋め込みの命令の `learn` は `talk` と読む。ファイルを直接開いても LMS から開いても、スライドショーでツールバーを出して開く：前へ・**再生** / **一時停止**（`a`）・次へ・**再生速度**（ボタンに `1×` と出し、押すと 0.75・1・1.25・1.5・2 倍の順に替わる。`<` / `>` で遅く / 速く）、そのあと発表のツール・一覧・表示・先のステップを薄く見せる・字幕・読み上げで聞く・発表者ビュー・全画面・キーの一覧。声は選んだ速さで、高さを保って流れ、ステップも同じ速さで進む。一時停止してもう一度再生すると同じ所から続く。再生中にツールバーの前へ・次へ・数字＋Enter・一覧で選ぶと、移った先のステップから再生を続ける。発表者の送りのキー（→・Space・← など）は、発表のときと同じく再生を止める。文書が隠れたら一時停止する。`?embed=1` では親が `{egatari:"play"}`・`{egatari:"pause"}`・`{egatari:"rate", value}`・`{egatari:"mode", id?, mode}`（今のモードを答える。`learn` は `talk`。ほかのモードには `error`（code `mode`）：モードは開くときに決まる）を送ってよく、`{egatari:"state", playing, rate}`（と `playBlocked`）を受け取る。

**見せるモードと見え方**：`egatari.json` の `metadata.offer`（`{modes?, faces?, open?: {mode?, face?}}`、format spec §1.2）は、どの組み立て（作業フォルダの `out/deck.html`・Egatari ファイルとその再生専用）でも `deck-meta.offer` に写す。以前のバージョンの `learn` は `talk` と書き、知らない値は捨てる。開くときは次の順で、先に当てはまるものが勝つ：`?mode=` / `?layout=`（埋め込みの親の指定も）→ この端末で前に選んだ並べ方 → `offer.open` → `metadata.primary`（見え方）→ `<html data-mode>`（モード）→ スライドショーのスライド。`offer.modes` に `talk` がなく、`offer.open` がモードを決めないときは、offer の初めのモードで開く。`offer.faces` にない見え方は **表示**・`r`・**本で読む** に出さない（`talk` はスライド、`read` は本。スライドと本は両方が要る）。`?layout=` で名指せば開ける。これは作者の意図で、決まり（アクセス制御）ではない。

進行状況（Player P6、format spec §9.2）は 1 つの口で記録する。探す順は、SCORM 1.2 の `API`（この窓と親の窓 7 段まで、次に開いた窓。[SCORM 1.2 の包み方](https://github.com/egatari/egatari-spec/blob/main/bindings/scorm12.md)）、`?embed=1` の枠の親（`postMessage`）、この端末（`localStorage`）。ステップは、スライドが見えているとき（スライド・スライドと本・スライドで見る。本だけでは台本の今のスライドが再生している間だけ）に、舞台が自分で（再生・次へ・スライドのクリック・ステップへのリンクで）そこへ来たら**再生した**（`via: "stage"`）。舞台が本に付いていって動いただけの所は再生したことにしない。ステップは、本のその節（台本で読むではその台本）が 3 秒見えていたら**読んだ**（`via: "text"`）とする。スクロールで通り過ぎただけでは数えない。2 つは別々に持つ。すべてのステップを再生したか読んだら、または `metadata.completion` の決まり（`visitedFraction`・`reachedEnd`、再生したものだけを数える `played: true`）を満たしたら終えたことになる。出来事：`started`・`step` `{slideKey, stepKey, index, total, via}`・`completed`・`suspend` `{location, data}`。SCORM の `cmi.suspend_data` は `{"v":1,"n","h","seen","stage","text"}`：`seen` は包み方のとおり（再生したか読んだか）、`stage` と `text` はその 2 つ（省かない）。SCORM の API か埋め込みの親が見つかったときは、その位置が勝ち、この端末の**前回の続きから**は使わない。編集のプレビュー・動画・発表者ビューでは記録せず、ファイルには何も書かない。Egatari ファイルは `deck-meta.tracking` に `["scorm12","postmessage","local"]` を書く。どの組み立ても（作業フォルダの `out/deck.html` も）`egatari.json` の `metadata.completion` を `deck-meta.completion` に写す。

`?` の一覧の下に「フィードバックを送る」のリンクとバージョン（例：`v0.2.0`）がある。バージョン（プレーヤーのバージョン。ファイルを作った Studio のバージョンが違えば context に添える）・ブラウザ・OS・教材の言語・モードだけを入れたフィードバックの form を開く。教材の中身は送らない。動画・印刷・`data-feedback="off"` のときは出ない。

### 埋め込み

`?embed=1` を付けて教材を `<iframe>` に入れた親のページは、`postMessage` で教材を動かす（Player P8）。プレーヤーは `ready` を送った後、`window.parent` からの、文字列の `egatari` を持つオブジェクトだけを受け取る。送り先の origin は `*`。命令には `id` を付けてよく、答えに同じ `id` を付けて返す。時刻は秒。`t` が `null` ならそのステップの最終状態。

| 命令（親 → プレーヤー） | 働きと答え |
|---|---|
| `{egatari:"seek", id?, slide, step, t}` | そのステップの時刻 `t` へ。`slide` はスライドの id（`ready.timeline[].slideKey`）か 0 からの番号、`step` はステップの指定（`"0"`・`"1"`・… か `"concl"`。整数はそのステップと読む。なければ `"0"`）、`t` は秒か `null`（なければ `null`）。再生の状態は保つ：再生中なら `t` から続ける（`t` が `null` ならステップの初めから。ツールバーで跳ぶときと同じ）。この seek による `position` の後に `{egatari:"seeked", id?, slideKey, stepKey, t}` を答える |
| `{egatari:"play", id?}` / `{egatari:"pause", id?}` | 再生 / 一時停止。ブラウザが音声を始めさせなければ `playBlocked` |
| `{egatari:"rate", id?, value}` | 再生速度（0.75・1・1.25・1.5・2） |
| `{egatari:"mode", id?, mode}` | 今のモードを `{egatari:"mode", id?, mode}` で答える。ほかのモードは error（モードは開くときに `?mode=` で決まる） |
| `{egatari:"layout", id?, layout}` | `slides`・`flow`・`split`。`{egatari:"layout", id?, layout}` で答える |
| `{egatari:"preview", id?, on}` | 先のステップを薄く見せる（`true`）・見せない（`false`）。`l` キーと同じ。`{egatari:"preview", id?, on}` で答える。動画では使えない |
| `{egatari:"controls", id?, visible}` | プレーヤー自身の操作を出す・隠す：ツールバー・取っ手・出し方の 1 行・本の再生と表示のボタン（`controls=0` と同じもの）。キーは効いたまま。`{egatari:"controls", id?, visible}` で答える。`controls=0` で開いた後の `visible:true` はツールバーを作って出す |
| `{egatari:"links", id?, follow}` | スライドへのリンクで動くか。`{egatari:"links", id?, follow}` で答える |
| `{egatari:"snapshot", id, …}` | 作っていない（Player P8 では OPTIONAL）：`{egatari:"error", id, code:"unsupported"}` を答える |

| 知らせ（プレーヤー → 親） | いつ |
|---|---|
| `{egatari:"ready", version, docId, sourceSha256?, timeline}` | 読み込んだ文書ごとに 1 度、初めの `position` より前（[URL の引数](#url-の引数)の `?embed=1`） |
| `{egatari:"position", slideKey, stepKey, t, cause}` | ステップが変わるたび。`cause` は `play`・`seek`・`control`・`link` |
| `{egatari:"stepEnded", slideKey, stepKey}` | 再生がそのステップを終わりまで流した。飛ばしたステップ（次へ・跳ぶ・`seek`）や、終わる前に一時停止・停止したときは送らない |
| `{egatari:"ended"}` | 再生がタイムラインの最後のステップを終わりまで流した。そのステップの `stepEnded` と、`playing: false` の `state` の後に来る |
| `{egatari:"state", playing, rate}` | 再生の状態か速さが変わるたび |
| `{egatari:"playBlocked"}` | 利用者の操作がないので音声を始められなかった |
| `{egatari:"linkRefused", slideKey, stepKey}` | スライドへのリンクで動かなかった（`?links=0` か `links` の `follow:false`） |
| `{egatari:"error", id?, code, message}` | 命令が失敗した。`snapshot` と知らない命令は `unsupported`、使えない引数はその命令の名前（`seek`・`preview`・`controls`・`mode`・`rate`・`layout`・`links`）で、プレーヤーは動かない |

台本の話の切り替わり（`turn`、Player P8 では OPTIONAL）は送らない。`postMessage` の口の進行状況の出来事は[再生と進行状況](#再生と進行状況)にある。

### スライドと本

授業は 3 つの並べ方で見られる（Player P2）：**スライド**（舞台だけ）・**スライドと本**（左にスライド、右に本。縦書きでも同じ）・**本**（本だけ）。本は授業の本文（format spec §9C）。本文がなければ本の窓は **台本で読む**：スライドを小さく並べ、その後ろに各ステップの台本（並べると **スライドと台本**）。**表示**（ツールバーと本の上）か `r` で選ぶ。

- **開いたときの並べ方**：`?layout=`（埋め込みの親の指定も）→ この端末でこの授業に前に選んだもの（`localStorage`。ファイルには書かない。その見え方が offer にあるときだけ）→ `deck-meta` の `offer.open` → `metadata.primary`（`"read"` なら本）→ スライド（`offer.faces` がスライドを見せないなら本）。幅が 609px より狭いと、スライドと本は本だけになる。
- **位置は 1 つ**：どの並べ方でも同じスライドとステップで、替えても変わらない。スライドを動かすと、本はそのスライドの節（台本ならそのステップ）が画面の外にあるときだけそこへ動く。本をスクロールすると、スライドはその節のスライドのステップ 0 へ、読み進めてそのスライドへのステップのリンクを過ぎるとそのステップへ動く（スライドとつながらない節では動かない）。今の節・ステップには行の初め（左。縦書きは上）の線と `aria-current`。
- **自動再生の間**は本が付いてくる。本をスクロールすると付いていくのをやめ（再生と位置はそのまま進む）、本の下に **再生中の所に戻る** が出る。押すと再生中の所へ戻って、また付いていく。再生を始め直したときも同じ。
- **本で読む**（スライドの並べ方で、節のあるスライドの右上）：スライドと本にして、その節を開く（狭い画面では本だけ）。本の上の **戻る** で元に戻る。
- **スライドで見る**（本の並べ方で、スライドにつながる節の見出しの後ろ。本の中のステップのリンクと小さいスライドも）：そのスライドを本の上に画面の 8 割（スマートフォンでは画面いっぱい）で重ね、そのステップを動かす。← / → でステップ、自動再生のボタンで音声。Esc・**閉じる**・外を押すと閉じて、読んでいた所へ戻る。フォーカスは中（名前の付いたダイアログ）へ移り、閉じると押したボタンへ戻る。スライドと本の並べ方では、ステップのリンクはスライドを動かす。
- **仕切り**（スライドと本）：ドラッグ、またはフォーカスして ← / →（Shift で大きく）・Home / End。ダブルクリックか Enter で元に戻す（スライドが高さいっぱい、幅の 6 割まで）。スライドは 280px、本は 320px より狭くしない。この端末に覚える。
- **本の中**では矢印・Space・PageUp / PageDown・Home / End で本をスクロールする。縦書き（`writing-mode: vertical-rl`）の本は右から始まり、マウスのホイールと ↓・←・PageDown・Space で先（左）へ、→ で前へ。相互参照・引用・脚注のリンクは本の中で動き、**戻る**（Backspace も）で戻る。
- **台本で読む（本だけ）**：各スライドは最終状態のまま、小さなスライドとして台本と一緒に流れる。スクロールは読む位置を動かすだけでステップは動かさず、スライドが台本の上に貼り付くこともない。小さなスライドを押すと「スライドで見る」で開く。自動再生の間だけ、再生しているスライドがその小さなスライドの上で動き、本がそれに付いていく。動きを減らす設定では、再生するスライドは各ステップの最後の形を見せる。
- **読むためのツール**（本の上。Player P2）：**目次**は章と節（本がなければスライドの題）を並べ、読んでいる所に印（太字と線、`aria-current`）。↑ / ↓・Home / End・Enter で選び、Esc で閉じる。**検索**（本では Ctrl+F・⌘F でも）は本文の全体から探す（縦書きも、強調やルビをまたいでも。空白・大文字と小文字・全角と半角は区別しない）。Enter・Shift+Enter で次・前の検索結果、Esc で閉じる。目次・相互参照・引用・脚注で飛んだ後は**戻る**（Backspace でも）で戻る。上の細い線がどこまで読んだかを示す（ページの番号は出さない）。
- **文字と背景**（**Aa** のボタン）：文字サイズは 6 段（85〜175%。本文は組み直し、スライドの大きさは変わらない）、行間は標準・広い、背景は白・セピア・黒（本の窓だけ。スライドはテーマの色のまま。白はテーマの明るい地）。この端末に、すべての教材に覚え（`localStorage`）、ファイルには書かない。EPUB の読書アプリのユーザー設定（Readium CSS）にならう。
- **前回の続きから**：この端末で、スライドと本か本で開く教材は、読んでいたスライド・ステップ・本の所に戻り、一度だけ「前回の続きから」と**最初から**を出す。`#` で場所を指して開いたとき（読み込み直しを除く）・スライドで開いたとき・埋め込み・編集アプリのプレビューでは使わない。
- 本の**図**は押す（か Enter・Space）と拡大する（図の題を名前にした箱。Esc・**閉じる**・外を押すと図に戻る）。台本で読むの小さなスライドは「スライドで見る」を開く。
- **自動再生の間**、台本で読むでは読み上げている話に地の色を付ける（ステップの線はそのまま）。
- ページ分けと見開き・別の窓は後で。

### 字幕

`s`・CC のボタン・`?captions=1` で、今のステップの台本（`narration.md` の表示用の文字。読みと `{mark}` は除く）をスライドの下端の帯に出す。地は `--fg`、文字は `--bg`（品質チェックがこの 2 色のコントラスト 4.5:1 以上を見ている）。ステップを文のまとまり（2 行ほど。字が大きいほど短い。長すぎる文は読点や語の切れ目で分ける）に分け、1 つずつ出す。1 まとまりは `--cap-max-lines` 行（3）までで、超えたら後ろの行を見せる。手で送っている間（と音声のない自動再生）は、読む速さ（ja 7 字/秒、en 15 字/秒。`--cap-rate` か `DECK.captionRate`）で次のまとまりに進め、ステップが変わると最初から、最後のまとまりはそのまま残す。音声つきの自動再生と `?mode=video&captions=1` では、字数に比例して音声の時間を割り振って順に出す（動画で音声がなければ全部を出す）。大きさは `Shift+s`・`?capsize=`・テーマの `--cap-size` で変える。動画では `(i, k, t)` だけで決まる。ツールバーをスライドの下端に重ねるときは、帯が出ている間だけ字幕を帯の上へ上げ、隠れると戻す。印刷には出さない。`render/render.mjs` は字幕なしの `?mode=video` で開くので、焼き込むならそこに引数を足す。

### 読み上げで聞く

ツールバーのスピーカーのボタン「読み上げで聞く（音声ファイルにはなりません）」は、今のステップの台本を、この端末の音声合成で読む（Web Speech API。format spec §5.6）。**音声のない**ステップのためのもの：音声のあるステップではボタンが薄くなり、そのステップには音声があること（再生 <kbd>a</kbd> で流れる）を示す。読んでいる間は左上に「読み上げ中」と出る。別のステップに動く・<kbd>Esc</kbd>・もう一度ボタンを押すと止まる。

- 使うのは端末の中で動く声だけ（`localService === true` で、教材の `<html lang>` に合うもの。地域まで合う声・端末の既定の声・よく知られた自然な声が先で、Eddy や Bad News のような機械らしい声・遊びの声は後にし、Novice にも使わない）。ネットワークの声は、ブラウザがそれを既定にしていても使わない（文を端末の外へ送るため）。その言語の、端末の中で動く声が 2 つあれば Expert と Novice を別の声で、1 つなら同じ声で読む。1 つもなければ読まず、「この端末には、この言語の読み上げの声がありません」と知らせる。
- 読む文は、`deck-narration` の各発言の `ttsParts`（format spec §4：`{x|y}` の読みを当てた話す部分。`inputHash` に入るのと同じ値）をつないだものに、AI 音声と同じ文の前処理（`join-num-counter@1`）を当てたもの。どの組み立ても `ttsParts` を書く（サンプルの教材で 3〜7 KB ほど）。画面には出さず、字の絞り込みにも数えない。`ttsParts` のない前のファイルでは表示の文を読み、札に「読み方は反映されません（古いファイル）」を添える。読み辞書（`tts/yomi.yaml`）は編集アプリのプレビュー（[編集アプリ](editor.ja.md)の音声の板）と AI 音声だけで当て、プレーヤーでは当てない。
- 授業の音声ではない：ファイルにも動画にも何も書かず、タイムライン（`DECK.timeline()`）と `(i, k, t)` の描画は変わらない。読んでいるステップは読み終わるまで続き、`?mode=video` と印刷にはボタンがない。

### 読み上げとキーボード（アクセシビリティ）

`?mode=video` と発表者ビューの中の画面では足さない。どれも画素は変えない。

- 読み上げソフト：画面に出ない `aria-live="polite"` の領域（`#deck-live`）が、スライドが変わると「スライド n / N：タイトル」、次のステップでは新しく出たステップの文字（式は KaTeX の字から）、戻ったときや文字の無いステップでは「ステップ k / K」を知らせる。スライドは `role="group"`・`aria-roledescription="スライド"`・`aria-label` を持ち、隠れたスライドは `aria-hidden="true"` と `inert`。発表ではまだ出ていないステップも `aria-hidden`（授業では読める）。
- キーボード：ツールバーと発表者ビューのボタンは `aria-label`（`<html lang>` に従って日本語か英語）、切り替えのボタンは `aria-pressed` を持ち、フォーカスの枠は `:focus-visible` のときだけ出す。一覧は `dialog` で、サムネイルは名前つきのボタン。矢印で選ぶとフォーカスも動き、Esc で閉じると元のフォーカスに戻る。キーの一覧（`?`）も `dialog` で、開くとフォーカスが入り、閉じると戻る。書き込みの面は `aria-hidden` でフォーカスを取らないので、描いている間も Tab と Esc が効く。
- `prefers-reduced-motion` では各ステップを最終状態で見せる（動画を除く）。
- 品質チェックは `alt` の無い `<img>`（飾りなら `alt=""`）と、`aria-label` / `aria-labelledby` / `<title>` の無い SVG の図を警告し、名前の無いパーツを情報として挙げる。

### 発表者ビュー

今の画面（左。いつも、そのスライドの先のステップを `l` と同じく薄く見せる。濃さはテーマの `--preview-opacity`。発表者だけの見え方で、本体の画面は変えない）、**次のスライド**（右上。今のスライドにまだステップが残っていても、次のスライドをすべてのステップを出した最後の姿で見せる。最後のスライドではただ「終わり」）、今と次のステップの台本（右下。Novice の発言には印）、スライドとステップの番号、自動再生のボタン、ツールのボタン（レーザーポインター・ペン・消えるペン・消す・一覧・先のステップを薄く見せる。ペンの間は本体と同じ赤・青・黒の色のボタン。本体とは色の番号でやり取りするので食い違わない）、経過時間と戻すボタン（⟲）、時刻。発表者ビューで効くキー：→ ↓ Space PageDown / ← ↑ PageUp、a、x、d、v、Shift+d、Backspace、Esc、o、l（`l` とそのボタンで、先のステップを薄く見せるのを入／切するのは本体の画面だけ）。左の画面に描いた線は本体に出る。`postMessage` でやり取りするので `file://` でも動く。キーの行の右端に「フィードバックを送る」のリンク（`?` の一覧と同じ）。

### 印刷と PDF

印刷（`tools/pdf.mjs` かブラウザ）では、各スライドを最終状態で 1 ページ（1280×720）ずつ出す。強調・書き込み・ツール・進み具合の帯は出さない。

### 実行時の API（スクリプトと品質チェック用）

`DECK.seek(i, k, t, from)`、`go(i, k, animate)`、`next()`、`prev()`、`state()` → `{slide, step, max, key, mode, playing, rate, preview}`、`timeline()`、`autoplay(on)`（再生 / 一時停止。一時停止は所を覚える）、`playStep(d)`（前へ / 次へ。ツールバーと同じく再生の状態を保つ）、`jump(i, k)`（再生の状態を保ってそこへ）、`playing()`、`rate(v)`（引数なしなら今の再生速度。`RATES` が使える 5 つ）、`previewOn()`、`togglePreview()`、`offer()`（プレーヤーが使う `deck-meta.offer`：`{modes, faces, open}`。`null` は全部。以前のバージョンの `learn` は `talk`）、`modeFrom`（モードの出どころ：`query`・`offer`・`html`・`default`）、`tracking()`（→ `{adapter, total, hash, rule, stage, text, completed, started, suspendData}`。[再生と進行状況](#再生と進行状況)）、`stepKey(i, k)`、`marks(i, k)`、`morph(i)`、`slides`、`mode`、`ready`（パーツを mount し、開いたときの位置を描いたら true。並んでいないうちに起動した教材は舞台に大きさが付くまで待つ。[contract §3](contract.ja.md#3-パーツweb-components)）、`NARRATION`、`AUDIO`、`MARKS`、`TIMING`、`VERSION`（動いているプレーヤーのバージョン：Egatari ファイルでは `deck-meta` の `player.version`。1.0 より前のファイルでは `generator.version`。ふつうの build では `package.json` の `version`）、`MADE_WITH`（`generator.version`。なければ空）、`FEEDBACK_URL`（または `null`）、`feedbackUrl()`（欄を埋めた form の URL。または `null`）、`tools.{mode, setMode, clear, help, overview, color, readAloud}`（`color()` はペンの色の番号 0〜2、`color(n)` で変える。`readAloud()` は読み上げ中か、`readAloud(true / false)` で読む・止める）、`ReadAloud`（`kit/core/read-aloud.mjs`：`spokenTurns`・`pickVoices` など）、`TtsNormalize`、`captions(on)`（引数なしなら入か切か）、`captionSize(z)`（`"s"` / `"m"` / `"l"`。引数なしなら今の大きさ、動画では `null`）、`captionRate`（字/秒）、`toast(msg)`（短い知らせ）、`caption()`（出ている字幕の文字。無ければ `null`）、`announce()`（aria-live の領域の文字）、`resolveFragment(f)`（→ `{i, k, key, id}` か `{error}`）、`fragment(i, k)`、`follow(f)`、`back()`、`links()`（→ `{depth, follow, back}`）、`visited(i | 鍵)`（[contract §9](contract.ja.md#9-スライドへのリンク)）、`move(i, k, animate, cause)`（位置の `cause` を付けてそこへ。本の窓が使う）、`fit()`（舞台を置き直す）、`stageBox`（並べ方が置く：舞台を置く箱）、`panes.{layout(name), state(), watch(i, k), close(), menu(el), order(), offered()}`（[スライドと本](#スライドと本)。`layout()` で読み、`layout("split")` で替えて覚える。`state()` → `{layout, detached, playing, overlay, article, vertical, ratio, marked, reading: {size, lh, bg}, find, progress, resumed, figure}`。`readable()` → 本の窓の本文の欄と読む単位 `{el, steps}`。記録が見る）、`openHash`（教材を開いたときの `#`。`#` は除く）。`document` のイベントには `deck:captions`（`detail = {on}`）、`deck:tool`（`detail = {mode}`：`"laser"`・`"pen"`・`"vpen"` か `null`。発表のツールが変わったとき）、`deck:edit`（`detail = {on}`。開発サーバーと編集アプリのプレビューだけが、編集モードが変わったときに送る。実行系は発表のツールを切る。[開発サーバー](dev-server.ja.md)）もある。`document` のイベント：`deck:ready`、`deck:pos`（`detail = {i, k, max, n, key, nextKey, auto, cause, back}`。`cause` は `control`・`link`・`seek`・`play`、`back` は「戻る」の戻り先のスライドの見出しか `null`）、`deck:turn`（`detail = {i, k, j}`：自動再生の間、そのステップの台本で読み上げている話。音声の時刻を字数の割合に当てた見積もり。再生が止まると `j = -1`）。

## 開発サーバー

`node server/dev.mjs <deck.html> [--port 8730] [--theme 名前]`（`npm run dev -- …` でも）。詳しくは [dev-server.ja.md](dev-server.ja.md)。

| 項目 | ふるまい |
|---|---|
| `--port n` | 既定 8730。使われていれば次の番号を順に試す（20 回まで）。`--port 0` は空いている番号 |
| `--theme 名前` | build と同じ |
| 待ち受け | 127.0.0.1 だけ |
| 組み直すきっかけ | スライドのファイル、`narration.md`、`timeline.json`、`macros.tex`、`audio/manifest.json`、`data/`、`figs/`、`components/`、リポジトリの `kit/`、`vendor/components/`、`themes/`、自分のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）。同じスライド・ステップのまま読み込み直す |
| 開発用の build | 字を絞らない（速い）、直せる要素に `data-src`、音声は `/deck/audio/…`、組み立ての失敗は画面に出す |
| `e` | 編集モード。`h1 h2 p li td th`、`.big .note .sub .venue .au .thm .box .lead`、`.concl` の中の `span` をダブルクリック。⌘/Ctrl+Enter で保存、Esc でキャンセル。build の警告の数を札に出す |
| `n` | 今のステップの台本の引き出し（次のステップも表示） |
| `c` | コメントの一覧。クリックでそのスライドへ、「解決」で閉じる |
| Alt+クリック（Mac は ⌥ option+クリック） | コメントを残す（`comments.json`） |
| `m`（編集モード。スライドのツールバーのペンのボタンは「マーカー」になる。`d` でも開く） | マーカー：丸や矢印を描いてからコメントを書く（欄が開いている間に描いた線も同じコメントの線になる）。線は `strokes` として残る（[約束事 §13](contract.ja.md#13-レビューのメモ手書きの印)） |
| 衝突 | 開いた後にスライドか台本が変わっていれば保存しない |
| 書き換えるファイル | `deck.html`（直した要素だけ）、`narration.md`（そのステップだけ）、`comments.json`、`.cache/edits/`（新しい 30 個） |
| 口 | `GET /`（外枠。`?presenter=1` は発表者ビューの窓）、`GET /preview`（教材の文書。sandbox の中で開く。iframe に入れてよい唯一の口。外枠の `cap` と `Sec-Fetch-Dest: iframe` がそろったときだけ出し、ほかは 403 の文字のページ）、`/deck/<ファイル>`（動かない形：CSP の `sandbox`、音声・画像など以外は `text/plain` の attachment）、`/__dev/shell.js`、`/__dev/editor-ui.js`、`/__dev/presenter.js`、`/__dev/events`（SSE）、`GET /__dev/info`、`GET /__dev/source?range=a-b`、`POST /__dev/edit`、`GET`/`POST /__dev/narration`、`GET /__dev/comments`、`POST /__dev/comment`、`POST /__dev/comment/resolve` |

## 品質チェック

Egatari の品質管理は、**規格**（[書き方の指示](authoring-with-llms.ja.md)の `R-fit`・`R-steps` など）、それに照らして**指摘**を出す**品質チェック**、指摘を AI に渡す**修正依頼**からなる。品質チェックにはコマンド版（`npm run check`。下。すべての項目）とブラウザ版（[編集アプリ](editor.ja.md)。下の「**編集アプリでは**」に挙げたわずかなものを除くすべての項目）がある。

`node kit/check.mjs <deck.html | 作業フォルダ> [--theme 名前] [--lang ja|en] [--json]`。メモリ上で build し、ヘッドレス Chrome で開いて、スライドごとに結果を出す。エラーがなければ終了コード 0、エラーが 1 つでもあれば 1、数え上げのできない決まりが残ったときは 3（下）、ヘッドレスのブラウザが起動できないか途中で落ちて検査が終わらなかったときは 2（理由は stderr だけ。`--json` では `{"ok": false, "status": "crashed", "counts": {…すべて 0}, "results": []}` で、「エラー 0」とは見分けがつき、指摘にもならない）。`--theme` で別のテーマで確かめられる（なければ `<html data-theme>`）。エラーと警告の指摘は、どこか（スライドの番号・見出し・id・ステップ）、何が違うか、どう直すかを言い、[書き方の指示](authoring-with-llms.ja.md)の規格があればその名前（`（R-title）` など）を添える。そのまま修正依頼に貼れる。`--lang` は指摘の言語（既定は教材の `<html lang>`。`ja` かなければ日本語、ほかは英語）。

`--json` の形：

```json
{"ok": false, "lang": "ja", "counts": {"error": 1, "warn": 0, "info": 12},
 "results": [{"slide": 2, "id": "s-k3f9q2", "key": "s-k3f9q2", "title": "減衰の式", "step": "3",
              "sev": "error", "code": "narrOrphan", "rule": "R-narr-steps", "data": {…},
              "msg": "スライド 2「減衰の式」（s-k3f9q2）、ステップ 3：口述原稿の [3] に当たるステップがスライドにない……（R-narr-steps）"}]}
```

`status` が `crashed`（終了コード 2）の結果は無効：検査が終わっていないので、`results` が空でも合格ではない。終わった検査は `"status": "ok"`。

結果は、検査器の決まり（`kit/core/check-rules.mjs`）を 1 つずつ数え上げる：[書き方の指示](authoring-with-llms.ja.md)の作者への決まり `R-*` と、検査器の族 `C-*`（組み立て・スライドの id・リンク・音声・添付・本・読み上げ・モーフ・再現性・字体・一覧）。指摘の `code` は、どれもちょうど 1 つの決まりに入る。決まりはそれぞれ次のどれかで終わる。

- `checked`：見て、エラーがない（警告や情報はあってよい）
- `failed`：エラーが 1 つ以上ある
- `excused`：この教材には当てはまらない。`reason` は決まった語：`noNarration`・`noAudio`・`noAttachments`・`noParts`・`noMarks`・`noMorphs`・`noLinks`・`noBook`・`tate`・`lang`
- `skipped`：この回には見られなかった：`noBrowser`、または編集アプリの品質チェックでの `notInEditor`（編集アプリも同じ決まりの一覧を返す）、または `tate`（中身のスライドがみな縦書きの教材の R-geometry。まだ測らないので、合格には数えない）

```json
{"ok": true, "status": "ok", "ruleSet": "c754293364b5",
 "rules": [{"id": "R-fit", "kind": "authoring", "state": "checked", "reason": null, "counts": {"error": 0, "warning": 2, "info": 0}, "codes": ["bodyBottom"]},
           {"id": "C-audio", "kind": "checker", "state": "excused", "reason": "noAudio", "counts": {"error": 0, "warning": 0, "info": 0}, "codes": []}],
 "summary": {"checked": 24, "excused": 6, "skipped": 0, "failed": 0, "total": 30}}
```

`reason` は `checked`・`failed` では `null`。`codes` はその回に出た code。`ruleSet` は決まりの一覧かその code が変わったときだけ変わる。どの状態にもならない決まりが残るか、`excused`・`skipped` の決まりに code が出たときは `"status": "incomplete"`（終了コード 3。`unset` と `problems` が付く）：全部を見ていないので、これも合格ではない。スクリプトは終了コード 2・3 とこの 2 つの status を失敗として扱う（`kit/core/check-result.mjs` の `parseCheck` がそうする）。文字の出力の最後に 1 行：`品質チェックの項目：見た 24　当てはまらない 5　見られなかった 0　落ちた 0（29 のうち）`。

| 欄 | 意味 |
|---|---|
| `slide` | スライドの番号（1 から）。教材全体なら `null` |
| `id` | スライドの `id`。なければ `null`（id のないスライド・教材全体） |
| `key` | スライドの id（id がなければ、見出しから決めた旧来の名前） |
| `title` | スライドの見出しの字（`h2` / `h1`、タグなし） |
| `step` | その結果のステップ：`"0"`・`"1"`・… か `"concl"`。スライド全体のことなら `null` |
| `sev` | `error`・`warn`・`info` |
| `code` | 結果の種類（変えない名前。一覧は `kit/check-messages.mjs`） |
| `rule` | 書き方の指示の規格の名前（`R-title`・`R-fit` など）。なければ `null` |
| `data` | その結果の値（本文のはみ出しなら `{"px": 583, "lim": 565, "concl": true}` など。`metrics` が既定と違うテーマでは `conclTop`・`line`、`bodyRight` の `lim` も）。修正依頼が削る量を言うのに使う |
| `msg` | `lang` の指摘の全体：どこか・何が違うか・どう直すか |

| 品質チェック | 重さ |
|---|---|
| build の警告。どのスライドにも合わない台本の `##`、決まった書き方でないステップの番号（`[01]`）、規則に合わない `{#id}` | 警告。エラー |
| `^[A-Za-z][A-Za-z0-9_-]{0,63}$` に合わないスライドの id（`slide id: …`）。鍵が同じスライドが 2 枚（`slide key: …`）。教材のほかの id や `\htmlId{…}` と同じスライドの id（`slide id: …`） | エラー |
| `## 見出し {#id}` の見出しの文字列が、そのスライドの見出しと違う（id が勝つ） | 情報 |
| 旧来の規則で鍵が決まるスライド：手で書いた `data-key`、または `s<番号>`（id も見出しもない）—`slide key: legacy` | 警告 |
| 1.0 の語彙にない書き方（形式の仕様 §8.0）：色のクラス `blue`・`red`・`gray`（`term`・`emph`・`muted` にする）、`data-steps`・`data-anim`（ステップと動きは `data-step`・`data-at`・`draw`・パーツから決まる）、`<html data-mode="lecture">`（参加者が選ぶ「先のステップを薄く見せる」）—`legacyColorClass`・`legacyStepAttr`・`legacyLectureMode` | 警告 |
| スライドへのリンク（`#<id>`・`#<id>:<ステップの鍵>`・`#N`）で、行き先のスライドがない・ステップが範囲の外・結論のないスライドへの `:concl`。`#N` のリンクと id のないスライドへのリンク。ない相手のファイルへの相対リンク（[contract §9](contract.ja.md#9-スライドへのリンク)） | エラー。警告。警告 |
| パーツのデータが宣言した形（`static shape`）と合わない、またはパーツが描くときに例外を出した（`compData`：どのパーツの、どこが（場所・期待・実際）違うか、形と例。規格 R-components）。スライドのステップは `data-step` の要素と `.concl` からも数えるので、パーツが描けなくても台本が「スライドにないステップ」にならない | エラー |
| 予想（`m-predict`）の答えが、人数を数えるステップと同時に開く（`predictAnswerWithCount`、規格 R-steps）：パーツは数の棒と −1・＋1 の操作をパーツのステップ 1 で出し、答え（✓・枠・note）を `answer-step` で開くので、`answer-step` が 1 以下だと数える前に答えが見える。値はパーツと同じ読み方（`Math.max(1, Math.round(+値) || 2)`）：属性なし・`0`・空・数でない字は既定の 2 で知らせない。`1`・`1.4`・負の数は 1。「answer-step を 2 以上に」と知らせる。原稿から読み（`kit/core/predict-steps.mjs`）、編集アプリの品質チェックも同じ関数。パーツ 1 つに 1 つ。修正依頼に入る | 警告 |
| 予想（`m-predict`）の答えが出ない（`predictAnswerNeverShown`、規格 R-steps）：`steps` の属性（`+値` で読む）が上の答えのステップより小さい。プレーヤーはパーツを `steps` で止める。`steps` がなければ答えのステップと同じ。数でない `steps` はパーツのエラー（`compData`）に任せる。両方に当たるときはこちらだけを出す。「steps を answer-step 以上に」と知らせる。同じ関数で、編集アプリと修正依頼も上と同じ | 警告 |
| コンソールのエラー（言葉だけ。スタックの行とファイルの場所・一時フォルダ・手元のサーバーの URL は除く） | エラー |
| ステップ 0 で見えている本文 | 情報 |
| タイトルが 26 字（全角）を超える（日本語）/ 60 文字を超える（英語） | エラー / 警告 |
| タイトルがコロンで終わる | エラー |
| `layout-tate`：縦組みのタイトルが列に収まらない | エラー |
| 結論の行が 35 字を超える（日本語）/ 70 文字を超える（英語）。結論が枠からはみ出す（`layout-tate` の縦の列でも） | エラー / 警告。エラー |
| 本文が 565px（`noconcl` は 680px）より下、1236px より右に出る。`layout-tate` では 680px より下、1162px より右（見出しの列に重なる）、124px より左（結論の列に重なる。結論がなければ 44px）。これらは既定の値で、限りはテーマの `metrics` から決める（[テーマ](#テーマ)） | エラー |
| テーマが描く箱がその `metrics` と 1px を超えて違う、または `metrics` のないテーマ（かスライド自身の `<style>`）が本文・結論の行・縦組みの列を動かす（`themeMetricsDrift`。教材に 1 回。項目ごとに宣言の値と描いた値、動かしたのがテーマの CSS かスライドの CSS か）。使えない `metrics` の値（`themeMetricsInvalid`。教材に 1 回）。同梱の字体が読み込めず、箱を測らなかった（`metricsFontLoad`。教材に 1 回。代わりの字体では測らない） | 警告 |
| 本文の字が 27px 未満、表・図の字が 24px 未満、SVG の字が 24px 未満（見出しに「文献」を含むスライドは除く。`rt` の振り仮名は数えない。`data-annot` を付けた要素の中の字、つまり `m-kanbun` の読む順の番号のようにわざと小さくした注記は数えない：[約束事 §10](contract.ja.md#10-品質チェックわざと切る)） | エラー |
| `overflow` が `visible` でない箱で切れる字（`textClipped`）、枠（viewBox）で切れるかスライドの外に出る SVG の字（`svgTextOut`）、まわりの `<rect>` からはみ出す SVG の字（`svgTextBox`）、`.body` の外に置いてスライドの外に出るか見出し・結論の行・ページ番号に重なる字（`outsideBody`）。`data-clip` を付けた要素の中の字はこれらで見ない（[約束事 §10](contract.ja.md#10-品質チェックわざと切る)）。`bodyBottom` のスライドでは、`.body` の中の字がスライドの外に出ることを重ねて知らせない | 警告 |
| どのスライドでも（表紙・章の扉・`layout-tate`・絶対位置の配置）：`.body` のないスライドで 1280×720 の外に出る字（`textOffSlide`。`.body` のあるスライドでは `outsideBody`）、ほかの字の箱やスライドの帯（飾り。表紙の上の帯など）に重なる字の箱（`textOverlap`：2 つの箱の行の矩形が縦横とも 2px を超えて重なる。KaTeX の式は式の見た目の箱 1 つで比べる。親と子、同じパーツの中の字どうし、SVG の字は比べない。本文の場所のエラーのあるスライドでは、本文の字と見出し・結論の行の重なりを重ねて知らせない）。表紙と章の扉では、置ける子要素と副題の置き場所を添える。`data-clip` の中の字、見えない字、KaTeX の MathML、`.sr-only` は見ない | 警告 |
| 表のセル（`td`・`th`）の語が途中で折り返す（`cellWordBreak`）：日本語・中国語の字を含み、空白を除いて 6 字までのセルが 2 行以上になる、または日本語・中国語の字のない語（`Intl.Segmenter` の語）の途中で行が変わる（ブラウザは英語の語を空白やハイフンでしか折らない。`overflow-wrap`・`word-break` で割れる）。長い日本語のセルがふつうに折り返すのは知らせない。直し方は、列を減らす・語を短くする・その列を広げる | 警告 |
| 本文の「です・ます」（日本語） | エラー |
| 組まれていない式、KaTeX のエラー | エラー |
| 教材の中で「、。」と「，．」が混ざる（日本語） | 警告 |
| 編集アプリのスライド一覧のテンプレートのまま（`kit/core/template-text.mjs`）：仮の印 `✎` で始まる台本の行（`narrPlaceholder`）、テンプレートの字（「新しいスライドの見出し」「1 つ目の項目」など）のままのスライドの字（`templateText`）。仮の行は TTS が読み、字幕と読める層にも出るので、TTS（`tools/narration-json.mjs`・`tts/synth.py`）・`--portable`・`--play-only`・編集アプリの TTS とエクスポートは先に一覧を出す | 警告 |
| 古い音声：ステップの音声がほかの台本から作られている（`inputHash` が違うか `null`。`inputHash` がなければ TTS の控え `audio/seg_<digest>.json` で比べる）— `audioStale` | 警告 |
| 式を読み上げている台本（発言ごとにその言語の規則で。下を参照。「Markdown と HTML」のように英字の名前を挙げるだけの日本語の文は式としない） | 警告 |
| 1 ターンが 200 字（日本語）/ 60 語（ほかの言語）を超える | 情報 |
| 台本の言語がスライドの言語と違う（`narrLang`） | 情報 |
| `--fg --term --emph --title --accent2` と `--bg` のコントラストが 4.5:1 未満。`--muted` が 3:1 未満 | エラー。警告 |
| 原稿の中の、テーマの色の語彙の外の色（format spec §8.4、R-colors）。見るのは `<style>` の値・`style` 属性・SVG と HTML の色の属性（`fill`・`stroke`・`stop-color`・`flood-color`・`lighting-color`・`color`・`bgcolor`。`<script>` は見ない）。色をじかに書いたもの（16 進、`rgb()` `hsl()` `hwb()` `lab()` `lch()` `oklab()` `oklch()` `color()`、色を取るプロパティの中の色の名前、`var(--x, …)` のじかに書いた予備の値）と、相対色の構文で色相を変えた色（`oklch` `lch` `hsl` `hwb` は色相の成分が `h` そのもの以外（`calc(h + 30)`・数）、`rgb` と `color()` は成分のどれかが自分の名前以外、`lab` `oklab` は `a` か `b` を変えたもの）。許すもの：どの役割の `var(--…)`（`--lit` も、物の色 `--obj-*` も）、`var(--obj-…, …)` のじかに書いた予備の値（format spec §8.4 は、物の色の予備にその名前の色をじかに書くことを許す。名前に合う色かどうかは見ない）、役割どうし・役割と `--bg` を混ぜる `color-mix()`、色相を保って明るさ・鮮やかさ・不透明度だけを変えた相対色（`default` が `--title` を作るのと同じ） — `colorOutside`。種類ごとに 1 つで、値を並べる（`kit/core/color-vocab.mjs`）。情報なので修正依頼には入らない | 情報 |
| スライドごとに、見出しと本文の字と、その後ろの地のコントラスト（計算した色。画像・グラデーションの上と薄く見せている字は測らない）が 4.5:1 未満。いちばん低いものを 1 つ — `textContrast` | 警告 |
| 教材が `@egatari/fonts-extra` の字体を選んでいる（教材の CSS か自分のテーマ）のに、その包みが npm の包み `egatari` と一緒に入っていないので、その字体が入らない — `fontsExtraMissing`（入れ方を言う） | エラー |
| スライドの字が、ファイルに入っていない字体で出る（計算した `font-family` の最初の名前が、埋め込んだ字体でも総称でもない）。開く端末によって見え方が変わる — `fontNotEmbedded`（教材に 1 回、名前を挙げる） | 警告 |
| スライド・台本・本の見える字に、埋め込んだどの字体にもない字がある（@fontsource にない `∎` など）。その字は開く端末の字体で出る — `fontNotCovered`（教材に 1 回、場所ごとに字を挙げる。`node tools/font-coverage.mjs <組んだ HTML>` でも見られる） | 情報 |
| 章の扉（`class="slide sec"`）に `<h2>` があって `<h1>` がない（扉の題は `<h1>`。`<h2>` も同じに見せる） — `secHeading` | 警告 |
| 肩見出し（`.kicker`）が 24 字分（全角 1・半角 0.5）、ラテン文字なら 40 文字を超える — `kickerLong` | 警告 |
| スライドに肩見出しが 2 つ以上ある、または見出しの直前にない — `kickerPlace` | 警告 |
| 表紙・章の扉（`sec`）・縦書きのスライド（`layout-tate`）に肩見出しがある — `kickerSlide` | 情報 |
| パーツの描画が呼び出し順で変わる | エラー |
| 強調の目印が無い。ステップごとの強調の一覧 | 警告。情報 |
| モーフ：元のスライドが無い、同じ `data-id` が無い、ID の重複。対応の一覧 | 警告。情報 |
| `alt` の無い `<img>`、`aria-label`・`<title>` の無い SVG の図、名前の無いパーツ | 警告、警告、情報 |
| 本文の釣り合い（`balance`、R-balance）：最後のステップの本文（`.body`）を画素にし、スライドの地の色と違う画素（どれかの色で 24/255 より大きい差）を中身とする。本文に図（パーツ `m-*`、パーツと KaTeX の外の `svg`、`img`、`table`、`.katex-display`）があり、片寄った空きがいちばん下の図のすぐ下から始まる（図の描いた下端から空きまでのほかの中身、たとえば図の下の短い説明が本文の高さの 20% まで）ときだけ知らせる：図を高くできる場合。字だけのスライドは知らせない（上にそろえて始めるのが決まり）。中身の条件は、中身の重心（画素はどれも同じ重さ）が本文の光学的な中心（上から 45%）より本文の高さの 10% を超えて上にあり、かつ中身の外接矩形の下の空きが上の空きより本文の高さの 25% を超えて大きいとき知らせる（中身の画素が 2 つ未満の行と列は外接矩形に数えない）。`layout-tate` では横に読み替え（これも図があるときだけ。空きはいちばん左の図の左）、重心が真ん中より 10% を超えて右にあり、左の空きが右の空きより 25% を超えて大きいとき。四方の余白がそろえば 0 に近い。値には図（数と描いた端）、横の釣り合い（2 段組み）と、片寄った空きとその側もある。言葉は数だけ。結論の行は本文の外なので測らない。表紙・章の扉・`static` のスライドは測らない。修正依頼には入らない。`kit/check.mjs` だけ（編集アプリの品質チェックは画面を撮らない）。閾値は `kit/core/fill-measure.mjs` の `BALANCE`。`node tools/fill-report.mjs <deck.html \| フォルダ …>` がスライドごとの数を出す | 情報 |
| 短い同じ重さの要点だけの本文（`cardsHint`、R-purpose、backlog #189）：本文（`.body`）が箇条書き（`ul`）1 つ（`li` が 3 つか 4 つ）と、あっても短い導入の段落（`p`、60 字分まで）1 つだけで、ほかに何もない（`ol`・入れ子の箇条書き・パーツ `m-*`・`svg`・`img`・`canvas`・`video`・`table`・別行の数式がない）。項目はどれも 30 字まで（日本語の教材は品質チェックのほかの検査と同じ数え方、全角 1・半角 0.5。日本語でない教材は文字数）で、最長が最短の 2 倍以内。項目に行内の数式（組まれた `.katex`、または文中に残った `\( \)` `\[ \]` `$…$`）があるか、順を表す項目（先頭の記号を除いて まず・次に・そこで・最後に、first・next・then・finally（大文字小文字は問わない）で始まる、または → を含む）があれば出さない。1 つの教材で最大 2 つ（`CH` の `cap`）：それより多くのスライドが当てはまれば、項目の長さがいちばんそろっている（最長 ÷ 最短が小さい）ものを残し、同じなら前のスライド。そのとき「同じ重さの短い要点なら、カード（m-cards）にすると見やすいことがあります」と知らせる。1 スライドに 1 つ。表紙・章の扉・`static`・`layout-tate` は見ない。直すかは作成者が決めるので、情報だけで修正依頼には入らない（修正依頼を作る関数が外し、名前でも外す）。閾値は `kit/core/layout-scan.mjs` の `layoutScan` の中の `CH`。編集アプリの品質チェックにも出る（同じ関数） | 情報 |
| 描いた図の形（R-geometry、backlog #201、`kit/core/geometry-check.mjs`）。パーツは描いた図の箱・線・字に `data-part` の印と `data-part-id`（原稿の id）を付ける：箱は形の要素そのもの（`<rect>`・`<path>`・`<ellipse>`・`<polygon>`）に `data-part="box"`、線は `<g data-part="edge" data-part-from data-part-to>` で、線そのもの（`<line>`・`<path>`。矢じりは除く）に `data-part-line`、字は `<text data-part="label" data-part-of="box\|edge\|mark">`（縁取りがあれば `data-part-halo`、箱の外に置く字は `data-part-at="outside"`。`foreignObject` の字は中身で測る）、点は `data-part="mark"`。`@` で始まる端は節でない。各スライドの最後のステップで、スライドの座標で測る：線が、つないでいない箱の中を通る（`geoEdgeThroughBox`）、線が字を横切る（自分の線の字は除く。`geoLineOverLabel`。字に縁取りがあれば情報）、2 つの字が重なるか、字が持ち主でない点に重なる（`geoLabelOverlap`）、箱の字が箱の縁を越える（`geoLabelOutsideBox`。上下左右のはみ出し）。字の範囲は、横が字の送り幅、縦が基線から上下の字体ごとの決まった幅（`kit/core/text-band.mjs`）なので、字体の行の高さに左右されない。線の太さの半分 ＋ 2px までは重なりとみなさない（線の端が箱の縁に触れるのは正しい図）。印の付いた字は、この検査だけが見る（`textOverlap`・`svgTextBox` には出ない）。縦書きのスライド（`layout-tate`）は測らない：中身のスライドがみな縦書きなら決まりは `skipped`（`tate`）、縦横が混ざる教材では印のある縦書きのスライドの数を出す（`geoTateSlides`）。印を付けないパーツは見ない。パーツも印もない教材では決まりは `excused`（`noParts`） | 警告。情報 |
| タイムラインの合計と 1 枚ごとの長さ | 情報 |

**編集アプリでは。** 編集アプリの品質チェックは、上の表のどの行も同じコード・重さ・言葉で出す（体裁の行は同じ `kit/core/layout-scan.mjs`、描いた図の形は同じ `kit/core/geometry-check.mjs`、組まれずに残った数式は同じ `kit/core/raw-math.mjs`、原稿と台本の行は `kit/core/check-source.mjs` を通して同じ関数）。そのエラーと警告は修正依頼にも入る。`kit/check.mjs` だけのもの：画面を撮る、パーツの描き方が呼び出し順で変わる（`compOrder`）と本文の釣り合い（`balance`）、手元のファイルを見る、ないファイルへの相対リンク（`linkFileMissing`）と `fontsExtraMissing`、情報の一覧（ステップ 0 で見える字・パレット・ステップごとの強調・タイムライン・`fontNotCovered`・`extensionVersion`）。添付は編集アプリの「添付」の板とエクスポートで、本は本の板で、同じ決まりで確かめる。読み込めないパーツ（`component-requires-missing`・`component-not-in-catalogue`）はどちらでも組み立てが止まり、同じ言葉で知らせる。一覧とそれぞれのわけは `kit/core/check-parity.mjs` の `CLI_ONLY`。コマンド版が出し、編集アプリが出さず、この一覧にもないコードがあれば `tools/test-check-parity.mjs` が落ちる。 肩見出しの検査は、どちらも原稿を共通の `kit/core/kicker.mjs` で読む。

スライドと台本の言語は違ってもよい（字幕だけ別の言語にする、日本語のスライドに英語の台本を付けるなど）。台本の言語は `voice.json` の `"lang"`（TTS と同じ）、なければ、ほとんどの発言が教材と別の字で書かれているときはその言語（日本語の教材で日本語の字がない、ほかの言語の教材でほとんどの発言に日本語の字がある）、それもなければ教材の `<html lang>`。台本の品質チェックは発言ごとにその言語で見る：日本語の字のある発言は日本語の規則、英語の文は英語の規則（式とみなすのは `\` `^` `_` と密な演算子だけ）。

## build

`node kit/build.mjs <deck.html | 作業フォルダ> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio] [--portable] [--play-only] [--scorm]`（`npm run build -- …` でも）。フォルダを渡すとその中の `deck.html` を組む（`deck.html` がなければ、何が要るかを言って終了コード 1）。

| 選択肢 | 意味 |
|---|---|
| `-o ファイル` | 出力（既定 `<作業フォルダ>/out/<名前>.html`） |
| `--theme 名前` | テーマ（[テーマ](#テーマ)） |
| `--dev` | 編集用の `data-src` を付け、字を絞らない（開発サーバーが使う） |
| `--embed-audio` | 音声を AAC 64 kbps モノラルで埋め込む（ffmpeg が要る。なければ WAV のまま、警告）。なしでは出力からの相対パスで参照する |
| `--portable`・`--play-only`・`--scorm` | 編集できる原稿も中に持つ Egatari ファイル、その再生専用の写し、その写しを LMS 用に包んだもの。[Egatari ファイル](#egatari-ファイル--portable) |

最後の行に、スライド・式・パーツ・字のファイル・台本のステップ・音声のステップ・テーマ・大きさを出す。字：埋め込む字体は、@fontsource の分割ファイルのうち教材の字を持つものを、harfbuzz（WebAssembly の `harfbuzzjs`、`package.json` でバージョンを固定）で使う字だけに切り出し、woff2（`wawoff2`）にして、`unicode-range` を切り出した字にする。Python も TTF も使わず、編集アプリのエクスポートも同じバイトになる。同じ字・同じ分割ファイル・同じツールのバージョンなら、どの OS でも同じバイト（`tools/test-font-subset.mjs`）。予約された字体名を持つ Source Sans 3・Source Serif 4・Source Code Pro は切り出さない。`EGATARI_FONT_SUBSET=0` で切らずに分割ファイルのまま入れる。`--dev` と開発サーバーは切り出さない。圧縮した音声のキャッシュは `$TMPDIR/motion-slides-audio/`。埋め込む字：HTML の文字参照と `\u` エスケープをほどいた原稿の字、`<script type="application/json">` と台本の文字列、使うパーツの JS の文字列（日本語以外の教材では和文を除く）、パーツが自分で描くと宣言した字（パーツライブラリの記録の `glyphs`・`egatariParts.define` の meta の `glyphs`・`static glyphs`。字列か、`{ja: …, en: …}` なら教材の言語のもの）、印字できる ASCII（数字、ページ番号の `/`）、`Appendix`、日本語の教材ではさらに `付録` とよく使う和文の約物。ローカルの素材は[素材](#素材build-で埋め込む)のとおり埋め込む。


作業フォルダのパーツ（`<deck>/components/<名前>/index.js`）は実体のパスが作業フォルダの中にあるときだけ、パーツライブラリのパーツは `vendor/components/` の中にあるときだけ読む。作業フォルダのパーツが外を指していれば、警告して読まず、パーツライブラリのものにも替えない。作業フォルダの中の出力（`out/…`）と `egatari.json` は、シンボリックリンク（そのファイルか途中のフォルダ）を通しては書かない。リンクがあれば書かずに失敗する。

### 組み立ての上限

組み立ては埋め込みながら数え、上限を超えたらその場で `build-too-large` で止まる：原稿（32 Mi 字）、取り込みと埋め込みの回数の合計（`/*INCLUDE*/`・`{{JSON}}`・`{{FIG}}`・`data:` URI・`<link rel="stylesheet">`・`<script src>`・`@import`：10000）、前処理の後の大きさ（64 Mi 字）と埋め込み・式の後の大きさ（256 Mi 字）、解析の前のタグの数（500000）、式の数（20000）。読むファイルはすべて（テーマのファイル・ロゴ・親のテーマ、パーツ、台本、音声、字、実行系も）取り込みの回数に数え、読んだ大きさの合計（`readChars`：256 Mi。文字のファイルはバイト数、base64 は字数）にも、読む前にファイルの大きさで数える（大きすぎるものは読まずに断る）。大きさは見積もりで、読んだ後にも実際に読んだ大きさで数える（大きくなっていたファイルは断る）。大きさはいつもバイト数で数える（バイト数を返さない口から読んだ文字も、UTF-16 の字数でなく UTF-8 のバイト数で）。読むのは通常のファイルだけで、FIFO・デバイス・ソケットは `build-not-a-file` で断る。組んだ出力の全体も、つなぐ前に 256 Mi 字までかを確かめる。音声は数えたバイトから圧縮する：`.wav` を数えた大きさまで 1 回だけ読み、ffmpeg には元のパスでなく、そのバイトの自分だけが読める写しを渡す。Egatari ファイルのエクスポートは、自分で読むもの（台本・原稿のファイルの写し・`voice.json`・`egatari.json`・圧縮の前の音声）も組み立てと同じ数え方に数え、全体の大きさを、それぞれを作る前に確かめる：塊は見積もった字数、索引は JSON にする前の下からの見積もり（読み手の上限 `indexBytes` の 4 MiB とも比べる）、読める層は実体参照に直した後の字数を作りながら数える。base64 はすべてを確かめた後にだけ作る。実際の教材ははるかに小さい（`examples/tmlr2026-calibration`：原稿 11 KB・式 27・タグ 3400）。`build(env, src, {limits: {...}})` で変えられる（`kit/core/build-core.mjs` の `BUILD_LIMITS`）。編集アプリでは組み立てを Worker で動かし、60 秒で止める。作業場所から読むのは組み立てが参照したファイルだけで、同時に 8 つまで、1 つの読み取りは一覧の大きさまで（読み始める前に取っておいた分。一覧の後で大きくなったファイルは断る）。組み立ての外では、開発サーバー・編集アプリの問い合わせ・`npm run ids` が `deck.html`（32 MiB）・`narration.md`（16 MiB）・`comments.json`（4 MiB）を決まった上限で読み（`kit/core/bounded-read-core.mjs` の `READ_LIMITS`）、`npm run portable -- unpack` は形式の 100 MiB を超える入力を読む前に断る。どれも 1 つの上限つきの読み取りの口（Node は `kit/bounded-read.mjs`、ブラウザは `app/bounded-read.js`）を通し、ほかの場所の生の読み取りは `tools/test-raw-reads.mjs` が失敗にする。

<a id="1-ファイル--portable"></a>

### Egatari ファイル（`--portable`）

`node kit/build.mjs <deck.html> --portable` は `<作業フォルダ>/<教材の題名>.ega.html` を書き（名前は編集アプリのエクスポートと同じ規則：`metadata.title`、なければ教材の `<title>`。どの OS でも使える名前にする。題名がなければ `<教材の名前>.ega.html`）、書いたファイルの絶対パスを表示する。ふつうの build と同じように再生でき、さらに教材の原稿を中に持つので、元のフォルダがなくてもフォルダに戻せる（編集器で開き直せる）。教材を持ち運ぶための公開の形式 **Egatari（絵語り）**（[仕様](https://github.com/egatari/egatari-spec)、1.0 の草案）に従う。拡張子・ブロックの id・メディアタイプはその仕様のもの。

- **入るもの**：build が作業フォルダから読むファイルすべて（`deck.html`・`narration.md`・`macros.tex`・`timeline.json`・データ・図・画像・CSS・作業フォルダのパーツとテーマ）、ローカルのパスを声の名前だけにした `voice.json`、`audio/manifest.json` の音声のうち台本にあるステップのもの（`--embed-audio` と同じく AAC に圧縮。ffmpeg がなければ WAV のまま、警告）。音声は 1 回だけ入り、実行系はそこから再生する。
- **入らないもの**：`comments.json`、ドットで始まるファイルとフォルダ（`.cache/`・`.git/`・`.env` など）、`out/`・`video/`・`bundle/`・`node_modules/`、控え、`*.local.json`、資格情報、使っていない音声と TTS の控えのファイル。build が読んだのに外したファイルは知らせる。このリポジトリのパーツとテーマは写さず、名前・バージョン・SHA-256 で参照する（自分のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）のテーマは、教材の `themes/<名前>/` として写す）。パーツライブラリ・テーマ庫の名前は 1 つの識別子（`^[a-z][a-z0-9-]{0,63}$`）で、それ以外（パス・`..`・大文字）の名前を書いたファイルは読み手が断る。
- **教材の id**：初めてのエクスポートで、作業フォルダに乱数の `docId` を持つ `egatari.json` を作る。教材と一緒に残す（次のエクスポートも同じ id になる）。任意の `metadata` に `license`（SPDX の識別子か URL）・`copyright`・`attribution`・`creators`・`description`・`accessibility`・`curriculum`・`completion`・`derivedFrom`・`authorship`・`audience` を書ける。`license`・`copyright`・`attribution`・`creators` は実行系のメタデータ（`deck-meta`。作業フォルダの組み立てでも）にも写すので、再生専用の写しにも残り、プレーヤーのキーの一覧（`?`）の「ファイルの情報」に出る（題名・作成者・著作権・ライセンス・クレジットの表示）。題と言語は `<title>` と `<html lang>` から。
- **プレーヤーと作成**（仕様 §4.1・§7.1）：索引と `deck-meta` に、同梱のプレーヤー `player`（`{"name": "egatari-player", "version": …, "title": "Egatari Player"}`。`title` は人に見せる名前、`name` は変わらない識別子。バージョンは `kit/player.json` のもので、プレーヤーのファイルが `kit/player.lock.json` に記録したリリースと違えば `+dev.<commit>` を付ける。`npm run player:check`）と、ファイルを書いたソフト（作成）`generator`（`{"name": "egatari-studio", "version": <Studio のバージョン>, "title": "Egatari Studio"}`）を書く。`contracts` は `{"source": 1}`。組み直さない保存（段 A）は `player` と `generator` をバイトのまま残す。組み直すとこの Studio のものを書き、ファイルがほかのプレーヤーを持っていたときは知らせる（`playerChange`）。編集アプリはそのとき保存の前に聞く（[編集アプリ](editor.ja.md)の「組み直して保存する」）。
- **ファイルの CSP**（仕様 §4.2 の file policy）：`<meta charset>` のすぐ後、どのスクリプト・スタイル・リンクよりも前に `<meta http-equiv="Content-Security-Policy">`。中身は基準のもので、どこにも繋がらない（`connect-src 'none'`）。ライブ付きの再生専用ファイルは、ライブの endpoint だけをその場で `connect-src` に足す。`embed`（どのファイルでも `deck-extensions` に写す）の行き先は `frame-src` に入る。CSP がない・置き場所が違う・中身が違う（解析したディレクティブで比べる）ファイルは、読み手が「仕様に合わない」と知らせる（再生はできる）。
- **スライドの id**（仕様 §8.1）：ファイルの中のスライドにはどれも id、台本の見出しにはどれも `{#id}` がある。ないもの（AI が書いたばかりの教材、見出しの字・手で書いた `data-key`・`s<n>` の旧い鍵）にはエクスポートで付け、作業フォルダにも書き戻す（`audio/manifest.json`・`timeline.json`・`comments.json`・`egatari.json` の鍵も。控えは `.cache/edits/`）。build と品質チェックは id のないものも受け付ける。
- **スクリプトなしで読める台本**：全ステップの表示用の文字を、ふつうの HTML としても入れる（教材が動いているときは隠す）。保存・検索・読み上げのため。
- **拡張の行**（`@x-<名前>-<欄> 値`）はステップごとにファイルの索引に集める。
- **添付**（形式の §3.8。下書き・試行。§3.8 の案）：組み立てには使わない、読み手のためのファイル。`attachments/` の下（下のフォルダもよい）に置く：元の原稿（TeX・Word）、組んだ PDF、コード、データ、補足。役割・題・説明は `egatari.json` に、ファイルの `index.attachments` と同じ形で書く：`"attachments": [{"path": "attachments/paper.pdf", "role": "pdf", "title": "論文（PDF）", "description": "雑誌に載った版。"}]`。`role` は `source`・`pdf`・`code`・`data`・`supplement` のどれか、`title` は要る（ダウンロードの一覧に出す短い名前。1 行で 120 字まで。字は Schema と同じく Unicode の符号位置で数える）、`description` は任意（1〜2 文の文字だけ、1 行で 300 字まで。ダウンロードの一覧の題の下に出る。ほかの項目は残す）。`attachments/` の下の通常のファイルを入れる（シンボリックリンクはたどらない。隠しファイル・控え・認証の情報は上と同じく外す）。`index.attachments` に載るのは正しい役割と正しい題のあるものだけで、ほかは知らせて入れるだけ。正しくない説明は知らせて落とし、項目は一覧に載せる。
  - **役割ごとの形式**（§3.8。`kit/core/attach-content.mjs`）：`pdf` は PDF、`data` は CSV・TSV・JSON・テキスト・xlsx、`code` はプログラムの原稿（`.py`・`.r`・`.jl`・`.c`・`.mjs`・`.ts`・`.sh` など）・ノートブック（`.ipynb`）・環境の定義（`requirements.txt`・`pyproject.toml`・`uv.lock`・`environment.yml`・`Dockerfile` など）、`source` は TeX・Markdown・テキスト（BibTeX など）・docx、`supplement` は PNG・JPEG・WebP・PDF・テキスト。添付にしないもの：実行できるファイル、どの役割でも、よくある OS が実行する・スクリプトとして開く拡張子（仕様の一覧のとおり：`.js`・`.jse`・`.vbs`・`.vbe`・`.wsf`・`.wsh`・`.hta`・`.bat`・`.cmd`・`.com`・`.scr`・`.ps1`・`.command`・`.app`・`.jar`・`.reg`・`.lnk`。JavaScript の原稿は `.mjs`・`.cjs`・`.ts` で添付する）、WebAssembly、マクロを入れられる Office のファイルと古い Office のファイル（`.xlsm`・`.docm`・`.doc`・`.xls`・`.ppt`・RTF）、HTML、SVG、ほかの `.ega.html`、アーカイブ・入れ物（ZIP・TAR・7z など）、音声と動画、ほかのどの形式も。形式は拡張子から決め、中身（先頭の印と構造）と照らすので、名前を替えた実行ファイル・`.txt` という名前の HTML・2 つの形式を重ねたファイル（ZIP を後ろに付けた PDF、先頭に PDF の印のある画像）は断る。添付の塊には、その形式の媒体型を書く（`application/pdf`・`text/csv`、プログラムの原稿は `text/plain` など）。
  - **中身の条件**（何も実行せず、上限の内で確かめる。展開して読むのは 64 MiB まで、ZIP の項目の数と宣言の大きさにも上限があり、項目が重なるもの・宣言より大きく展開されるものは断る）：PDF は JavaScript・埋め込んだファイル・XFA がないこと。開いたときの動作（`/OpenAction`・`/AA`）は行き先か文書の中へ移る `GoTo`（LaTeX の hyperref が書く形）だけ、リンクは `GoTo` と `URI` だけで、ほかの動作（`Launch`・`SubmitForm`・`ImportData`・`GoToR`・`GoToE`・`Rendition`・`Named` など）はないこと。圧縮した object stream の中も見る。暗号化した PDF は、空の利用者パスワードで開けるもの（RC4・AES-128・AES-256）だけを復号して確かめ、ほかは断る。xlsx と docx（ZIP としてメモリの上で読み、ディスクに展開しない）：マクロ（`vbaProject.bin`・マクロを入れられる形式）・ActiveX・埋め込んだ object・外部リンクやほかの外への関係・データの接続や Web クエリ・DDE・外のデータを取りにいく関数（`WEBSERVICE`・`RTD`・`IMAGE`・`STOCKHISTORY`・`CALL` など）・実行する・取りにいくフィールド（`DDEAUTO`・`INCLUDETEXT`・`INCLUDEPICTURE`・`LINK` など。入れ子のフィールドで名前を作るものも）・外のテンプレートがないこと。テキストはテキストであること（NUL がない。BOM のある UTF-16 はよい）、JSON とノートブックは読めること。
  - **どうなるか**：組み立て（`--portable`）は、添付にできない形式や条件に合わない添付を、規則の名前を添えて知らせて外す。CSV・TSV・xlsx の、表計算のソフトが数式として読みうる値（`=`・`+`・`-`・`@`・タブで始まるもの。数は除く）と、資格情報や端末のパスらしい文字は、知らせて入れる。品質チェックは、仕様が禁じるもの（MUST NOT：許されない形式・役割が受けない形式・音声と動画・JavaScript のある PDF・マクロ・2 つの形式を重ねたファイル）をエラー、ほか（SHOULD：ほかの条件・中身が形式と合わない・確かめられない。数式として読まれる値・資格情報）を警告にする。
  - 上限は 1 つ 10 MiB・合わせて 20 MiB・100 個（base64 なので Egatari ファイルではおよそ 4/3 倍）。超えるものは知らせて外す（`kit/core/attachments.mjs` の `ATTACH_LIMITS`）。添付はコードに数えない（Extended にならない）。`requires` にも入れない（読み手は無視してよい）。読むのは組み立てと同じ大きさの数え方の内。
  - **Egatari ファイルの中の `egatari.json`** には、`index.attachments` とちょうど同じ一覧を書く（§3.3）：読み手の一覧に出ない項目は Egatari ファイルの写しから除き、知らせる。作業フォルダの `egatari.json` は変えない。展開は `index.attachments` を `egatari.json` に書き（`egatari.json` のない文書でも）、フォルダをまとめるときは一覧を `egatari.json` から読むので、展開してまとめ直しても記録は変わらない。`egatari.json` の一覧が索引と違う文書は読まない（`attachments-mismatch`）。
  - Egatari ファイルのプレーヤーは **?** の一覧（題・説明・ファイル名・役割・大きさ）と、帯のクリップのボタンに出し、**ダウンロードだけ**にする：出すのは、題が正しく、役割が受ける拡張子で、塊の媒体型がそれに合うものだけ（索引に書いてあっても、`.html`・`.js` や `pdf` として書いた CSV は出さない）。保存する名前はパスのファイル名そのもの（OS が受けない名前は、替えずに出さない）。コードの添付には「出どころを信頼できるときだけ、コードを実行してください」と添える。索引の hash と、添付ごとの大きさと SHA-256 を確かめ、先頭のバイトを形式と照らし（HTML で始まる `.txt` は保存しない）、中身を `application/octet-stream` としてダウンロードのリンクで保存させる。ページでも新しいタブでも開かない・実行しない。再生専用（`--play-only`）とふつうの組み立てには添付は入らない（形式が保存の層を除く）。品質チェックは、役割や題がない・知らない役割・書いたのにないファイル・使えない名前（`attachments/` の外・`..`・予約名・大文字小文字の重なり・隠しファイル・リンク）・上限を超えるものも警告する
- **エクスポートした写し**（`exportedFrom`、仕様 §3.1）：作業フォルダからのエクスポート（`--portable`・`npm run portable -- pack`・編集アプリの Egatari ファイルのエクスポート）は、索引に `{"kind": "folder", "sourceSha256": …}`（エクスポートしたときの原稿の hash）を書く。時刻・パス・利用者の名前は入れないので、エクスポートはバイトまで同じに作り直せ、展開してまとめると同じファイルに戻る。編集アプリで Egatari ファイルを保存しても（組み直さない保存も）印は変えないので、原稿の hash が印の値と違えば、エクスポートの後に写しを直したと分かる。「名前を付けて保存…」で新しいファイルとして保存する（新しい `docId`）と印を外す。フォルダからエクスポートし直すと置き換わる。Egatari ファイルが原本の教材（フォルダなしで編集アプリが保存したもの・貼り付けたもの・`deck.html` だけから開いたもの）には印がなく、再生専用の派生には索引がない。展開すると新しいフォルダが原本になる：`egatari.json` は印を持たず、次のエクスポートが新しい印を書く。
- **音声の記録**：ステップの音声ごとに、作ったときの台本の hash を残す。TTS の控えから、音声を作った後に台本が変わったと分かるときは、その hash を `null`（分からない＝古い）にする。展開してまとめ直しても `null` のまま。実行系の音声の項目には音声のメディアタイプも書くので、プレーヤーが推し量らずに済む。
- 30 MiB を超えると警告する（長い教材は章に分ける）。

| 選択肢 | 意味 |
|---|---|
| `--portable` | Egatari ファイルを書く（既定 `<作業フォルダ>/<教材の題名>.ega.html`。作業フォルダの最上位。`-o` で場所） |
| `--play-only` | 再生専用の写しを書く（既定 `<作業フォルダ>/<教材の題名>.play.ega.html`）：原稿は入れず、実行系とその音声だけ。原稿や拡張のデータを渡したくない参加者向け |
| `--scorm` | LMS 用の SCORM 1.2 のパッケージを書く（既定 `<作業フォルダ>/<教材の題名>.scorm.zip`。[SCORM 1.2 の包み方](https://github.com/egatari/egatari-spec/blob/main/bindings/scorm12.md)）：`imsmanifest.xml`（SCO が 1 つ。識別子は `egatari-<docId>`、題は教材の題名）と、再生専用の写しを `index.html` として（`--play-only` が書くものとバイトまで同じ）。項目の並びと時刻を固定し、圧縮しないので、同じ教材からは同じバイトになる。`adlcp:masteryscore` は書かない：プレーヤーが `metadata.completion` のとおりに「完了」を送り、点数は送らない。`deck-meta.tracking` に `scorm12` がないとき、再開のデータが 4096 字を超えうるとき（およそ 8,000 ステップより多い）は断る。[LMS で進み具合を取る（SCORM）](distributing.ja.md#lms-で進み具合を取るscorm) |
| `--without-live-results` | `--portable` と一緒に：ライブの結果（参加者の質問と答え）の添付を入れない。付けないと、結果の入る Egatari ファイルには知らせを出す。再生専用の写しには決して入らない（[ライブ](distributing.ja.md#ライブ授業中の質問と投票下書き)） |
| `--update-themes` | `egatari.json` が前のバージョンに固定した同梱のテーマ（下の `themes`）を今のバージョンにして組み、固定も書き換える。変わる色を出す |

`npm run portable -- unpack <ファイル> <フォルダ> [--force]` は原稿と音声を `<フォルダ>` に出す（音声の記録から `audio/manifest.json` も作るので、そのフォルダはそのまま build・pack できる）。ファイルは文字列として読み、中のスクリプトは動かさない。索引とすべての hash、仕様の上限とパスの規則を確かめ、`<フォルダ>` の外やシンボリックリンクを通る書き込みは断り、空でない `<フォルダ>` は `--force` がなければ断る。`npm run portable -- pack <フォルダ> [-o ファイル] [--play-only] [--without-live-results]` はそのフォルダで `build --portable` をするのと同じ。展開したフォルダをまとめると同じファイルに戻る。`npm run portable -- attach <フォルダ> <results.json> [--en]` は、ライブのサーバーからダウンロードした結果を、作業フォルダの役割 `data` の添付にする（`attachments/live-<部屋>-<日付>.json`、題は「ライブの結果（<id>、<日付>）」。`--en` で英語）。写しの Schema の結果でないもの・10 MiB を超えるもの・§3.8 の中身の検査に通らないもの・もう足した結果は断り、ライブの id が `egatari.json` の `extensions.live.room` と違えば知らせて足す。`npm run portable -- compare <ファイル> <フォルダ>` は、作業フォルダからエクスポートした写しとそのフォルダ（`egatari.json` の `docId` が同じ）を受け取り、エクスポートの後にどちらを直したかを原稿の hash で言う：`same`（どちらも直していない）・`copy`（写しを直した。写しを展開すればフォルダに戻せる）・`folder`（フォルダを直した。エクスポートし直す）・`both`（両方。どちらを残すかを選ぶ。混ぜない）。何も書かない。`exportedFrom` のないファイルと、ほかの教材のフォルダは断る。

`npx egatari ids-of <file.ega.html> […]` は、教材のバージョンを管理する組織のためのコマンドで、Egatari ファイルごとに 3 つを出す。`sourceSha256` は原稿のバージョンを表す：原稿のファイルだけを対象にし、音声と組んだ部分は含まない（形式 §3.4）ので、音声を作り直しても組み直しても変わらない。ファイル全体の SHA-256 はファイルそのものを表し、配布や LMS への登録のときの照合に使う（1 バイトでも変われば変わる）。`docId` はバージョンをまたいで同じ教材を指す。誰が公開したかは署名（形式 §10）の役目で、このバージョンではまだ実装していない。どちらの hash も、ファイルを作った人は示さない。

Egatari ファイルの読み取り（unpack と[編集アプリ](editor.ja.md#egatari-ファイルフォルダなし)）は、ほかに、中に入った `audio/manifest.json`（いつも音声の記録から作るもの）と、`docId` が索引と違う設定のファイルも断り、原稿の hash を files から計算し直す。索引や実行系のメタデータの値と違えば、組んだ教材と原稿が食い違うと知らせる。新しい major のバージョンのファイルと、読み手の実装していない機能を必須とするファイルは、索引と塊が 1.x の規則で確かめられたときだけ原稿を取り出せる（`readPortable(text, {extract: true})` と編集アプリの「作業フォルダにエクスポート…」）。編集もエクスポート（作り直し）もしない。

#### 組み直さない編集（段 A）

`kit/core/tier-a.mjs`（`tierA(original, files, {identity?, fonts?})`。Node にもブラウザにも依存せず、何も実行しない）は、台本・音声・秒数の上書きの編集を、形式の段 A（§7.2）として、組み直さずに Egatari ファイルに入れる。`files` は直した作業フォルダ（展開した形。`audio/manifest.json` を含む）。書き換えるのは次の所だけ：`deck-narration`・`deck-marks`・`deck-timing`・`deck-audio` の変わった項目（ほかの項目は書き方ごとバイトのまま）、読める層の変わった `<div data-step-key>`、`deck-meta` の `sourceSha256`（`identity` があれば `docId` も）、索引の変わった項目（`files`・`blobs`・変わった音声の記録・`requires`・`sourceSha256`・拡張の行から作る拡張のうち変わった行から作られる項目、`identity` があれば `docId` と `metadata.derivedFrom`。そのときは `exportedFrom` を外す）とその `data-sha256`、塊（新しい中身を足し、参照されなくなったものを除く）、そして変わった台本に、ファイルの `@font-face` がまかなわない字があるときだけ、その字を含む `@fontsource` の分割ファイルを入れた新しい `<style id="…font-supplement-<n>">`（`fonts`：`{faces(key), load(file)}`）。`<n>` は今ある補いの番号のいちばん大きいものの次（0 から）で、`@font-face` を持つ最後の style 要素の後に置き、埋め込んである字（family・weight・style）のうちその字を持たないものごとに 1 つの `@font-face` を書く（400 だけを埋め込んだファイルには 400 だけ。ファイルが埋め込まない family には書かず、知らせる）。ほかのバイトはそのまま。知らない項目はどの深さでも残す。台本が変わったステップの音声の記録はそのまま（`inputHash` が合わなくなるので古い）。ステップの台本をまるごと消したときは、その音声の記録と塊も消して知らせる。どのスライドにも当たらない鍵の台本は読める層に入れず、知らせる。返すのは `{ok: true, html, index, deckMeta, changes, warnings}` か、組み直しが要るとき（`source-changed`：`narration.md`・`timeline.json`・設定のファイルのほかが変わった）、組んだ教材と原稿が食い違うとき（`source-mismatch`）、`timeline.json` が JSON の object でないとき（`timeline`）、場所が見つからないとき（`layout`）の `{ok: false, code, reason}`。結果を展開してまとめ直すと、原稿のファイル・音声の記録・実行系の JSON・読める層・索引は同じで、字（組み直しは `deck-base` に字を選び直し、補いは足さない）と、塊の並びが違うことがある。`tools/test-tier-a.mjs` が場所を見分ける差分（`tools/tier-a-diff.mjs`）で確かめる。

添付は保存の層の項目なので、`attachments/` の下のファイルを足す・消す・名前を替えること、`egatari.json` の役割と題を替えることも段 A で済む：変わるのは索引（`files`・`blobs`・`sourceSha256`・`attachments`）・塊・`deck-meta.sourceSha256` だけ。スライドの原稿がその添付のパスを書いているとき（組み立てが読んだかもしれない）は `source-changed`、足した・中身を替えた・役割を替えた添付が上限・名前の規則・上の §3.8 の形式と条件に合わないときは `attachments` で断る。前から Egatari ファイルにあって変わっていない添付はそのまま残し、合わなければ知らせる。`egatari.json` が `index.attachments` にない項目（役割や題のないもの）を書いているときは、保存する写しを `index.attachments` とちょうど同じ一覧にし、結果の `config` にその文字を入れる（エディタは作業場所にも書く）。

## TTS

`uv run --project tts python tts/synth.py <deckdir> [選択肢]`。詳しくは [video.ja.md](video.ja.md)。

| 選択肢 | 意味 |
|---|---|
| `--voices expert=a,novice=b` | 声（`voice.json` より優先） |
| `--ref-dir DIR` | 参照音声のフォルダ（`IRODORI_REF_DIR` より優先。既定 `tts/voices/`。npm の包みでは、ない既定の声を初めて使うときにキャッシュへ取り寄せる。`tts/voices.json`） |
| `--engine irodori\|voxcpm2` | `voice.json` の `engine` と教材の言語より優先 |
| `--yomi FILE` | 読み辞書（`MOTION_YOMI` より優先。既定 `tts/yomi.yaml`）。日本語だけ |
| `--only 鍵,…` | このステップ（`スライドの id:ステップ`）だけ |
| `--dry-run` | TTS を呼ばず、推定の長さの無音（日本語 7.5 字/秒、英語 2.5 語/秒）。キャッシュは別 |
| `--force` | 音声のキャッシュを無視する |
| `--replace-recorded` | 録音と取り込みの音声（manifest の `kind` が `recorded`・`imported`。編集アプリの音声の板が書く）も TTS で作り直す。付けなければ残す |

| `voice.json` の項目 | 意味 |
|---|---|
| `expert`、`novice` | 名前（`<参照音声のフォルダ>/<名前>.wav`）かパス（`/` を含むか `.wav` で終わる。相対なら教材から）。既定 `bob`、`alice`。参照音声は Egatari ファイル（.ega.html）に入らない：作業フォルダの外に置く |
| `lang` | 言語（既定は教材の HTML の `lang`。渡したファイル、`<deckdir>/deck.html`、フォルダに 1 つだけある `*.html` の順。なければ `ja`） |
| `engine` | `irodori`（日本語の既定）か `voxcpm2`（それ以外の既定） |

`audio/seg_<digest>.wav`、`audio/seg_<digest>.json`、`audio/manifest.json` を書く（台本から消えたステップは manifest から外す。wav は残す）。manifest の各ステップには `kind: "tts"` と、そのステップの台本の hash `inputHash`（format spec §5.4）も書くので、後で台本が変わったことを編集アプリと品質チェックが見分けられる。録音と取り込みの音声は残す（`--replace-recorded` を参照）。編集アプリでも、ブラウザで 1 ステップずつ録音・取り込み・作り直しができる（[編集アプリ](editor.ja.md#台本の音声音声の板)）。その後処理は `tts/core.py` と同じ数を使う。dry-run の音声が残っていれば警告する。サーバーが localhost でなければ、声のパスを手元で確かめない。終わったら build し直す。

## 動画のエクスポート

`node render/render.mjs <組んだ.html> --out <フォルダ> [選択肢]`（`?mode=video` で開く）。

| 選択肢 | 意味 |
|---|---|
| `--out フォルダ` | 必須 |
| `--fps n` | 既定 30 |
| `--scale x` | 既定 1.5（1920×1080） |
| `--only 鍵,…` | このスライドかステップだけ。ほかはそのまま。スライドの id か見出しから決めた名前（そのスライドの全ステップ）、または `スライドの id:ステップ`（1 ステップ）。どれにも当たらないものはエラーで、使えるスライドの id を示す |
| `--full` | `full.mp4` も。章が 2 つ以上なら `chapter_NN.mp4` と `chapters.json` も（全部のクリップが要る） |
| `--music ファイル` | 背景の音楽（省略可）：動画の全体の下に 1 本流す。台本の声の間は小さくし、終わりで消す（[video.ja.md](video.ja.md#背景の音楽)）。クリップの音声に入るので、キャッシュの鍵にも入る |
| `--force` | `.render-cache.json` を無視する |
| `--captions` | 台本の字幕を映像に焼き込む（`?captions=1`）。キャッシュの鍵に入る |

出力：`clip_NNNN.mp4`、`clip_NNNN.png`、`timeline.out.json`（`source, fps, sampleRate, music, scale, width, height, duration, clipDuration, segments[]`。各ステップは `index, clip, still, key, slideKey, stepKey, i, k, title, chapter, start, dur, anim, lead, audioDur, audioOffset, frames, clipDur, clipStart, start_ms, end_ms, transcript, text`）、`.render-cache.json`。ステップの数より後ろのクリップは消す。

## ツール

| コマンド | 用途 |
|---|---|
| `npm run new -- <フォルダ> [--lang en\|ja] [--theme 名前] [--title "…"]` | きれいなテンプレートから新しい作業フォルダ（`deck.html` と `narration.md`、`"componentsCatalogue": "2"` の `egatari.json`）を作る。空でないフォルダには書かない |
| `npm run ids -- <作業フォルダ \| deck.html> [--dry-run]` | id のないスライドに新しい id（`s-` と base32 の 6 字、乱数）を付け、`narration.md` の見出しを `## 見出し {#id}` にし、`audio/manifest.json`・`timeline.json`・`comments.json` と `data-morph="…"` の鍵を付け替える。音声は作り直さない。控えは `.cache/edits/`、改行はそのまま、2 回目は何も変えない。鍵の重なり・id の衝突・規則に合わない id のある教材では何もしない |
| `npm run ids-of -- <file.ega.html> […] [--json]`（`npx egatari ids-of`） | Egatari ファイルの身元をファイルごとに 1 行で出す（タブ区切りで `docId`・`sourceSha256`・ファイル全体の SHA-256。`--json` は ファイルごとに 1 つの JSON で `file`・`docId`・`sourceSha256`・`fileSha256`）。`sourceSha256` はファイルの原稿から計算し直し、ファイルに書かれた値と違えば stderr に警告する。再生専用のファイルは原稿がないので `sourceSha256` は `-`（JSON では `null`）。読めないファイルや Egatari ファイルでないものは stderr にエラーを書いて終了コード 1（ほかのファイルは出す） |
| `npm run portable -- unpack <ファイル> <フォルダ> [--force]`・`npm run portable -- pack <フォルダ> [-o ファイル] [--play-only] [--without-live-results]`・`npm run portable -- attach <フォルダ> <results.json>`・`npm run portable -- compare <ファイル> <フォルダ>` | Egatari ファイル ↔ フォルダ。[Egatari ファイル](#egatari-ファイル--portable) |
| `npm run player:check [-- --strict]`・`npm run player:bump -- patch\|minor\|major` | 同梱のプレーヤー（Egatari Player）：そのファイル（`kit/core/player.mjs` の `PLAYER_FILES`）を `kit/player.lock.json` のリリースと比べる（知らせるだけ。`--strict` は違えば失敗。リリース候補の前に）。bump は新しいバージョンを `kit/player.json` と lock に書き、`changes/player-<版>.md` を足す。[RELEASING.ja.md](../RELEASING.ja.md) |
| `npm run build:app` | 編集アプリを作る：`dist/` の配信版（GitHub Pages 用。`dist/index.html`）と、オフライン版のエディタ `dist/editor.html`。[editor.ja.md](editor.ja.md) |
| `node tools/test-app.mjs` | 編集アプリのテスト（OPFS のフォルダ、編集、台本、コメント、外での変更、エクスポート、発表者ビュー） |
| `node tools/get-fonts.mjs` | BIZ UDPゴシックと BIZ UDP明朝の TTF を `fonts/` に取ってくる（uv で使っている字だけに絞れるようになる） |
| `node tools/test-kokugo-example.mjs` | `examples/kokugo-kanbun` の漢文がパーツライブラリの `m-kanbun` で知らせなしに読めるか（ブラウザなし。パーツそのものの試験は egatari/components） |
| `node tools/theme-metrics.mjs measure <テーマ> [--lang ja\|en]`、`node tools/theme-metrics.mjs check <テーマ>` | テーマ（フォルダか名前。`--theme` と同じ）を描き、描いた箱から測った `metrics` の塊を出す（`theme.json` に貼る。整数の px で、どの端も限りが緩くなる側へ 1px 未満で外向きに丸める。同梱の字体が読み込めなければ測らずに終了コード 2）。`check` は宣言（なければ既定）と描いた箱を比べ、違えば終了コード 1 |
| `node tools/test-theme-metrics.mjs [作業フォルダ]` | テーマの `metrics`：検証と継承、テーマの hash、同梱のテーマがどれも宣言どおりに描かれる（厳しく）、品質チェックと編集アプリの品質チェックの限りと `themeMetricsDrift` |
| `node tools/test-layout-tate.mjs [作業フォルダ]` | `default` と `kokugo` のテーマでの `layout-tate` のスライド：見出しの列・本文・結論の列・ページ番号が重ならずに置かれる、seek の決定性、品質チェックの規格、スライドの id と読める層が変わらない |
| `node tools/test-check-colors.mjs [作業フォルダ]` | テーマの色の語彙の外の色（`colorOutside`）：値の種類ごとの決まり、原稿のどこを見るか、`tools/fixtures/check-colors/` の品質チェック（`var(--lit)`・じかに書いた予備を持つ `var(--obj-red, red)` などの物の色・役割の `color-mix()`・色相を保った相対色は出ない。色相を変えた `oklch` `rgb` `hsl` `lab` と、じかに書いた予備の値は情報として出て、修正依頼には入らない） |
| `node tools/test-check-cards-hint.mjs [作業フォルダ]` | カードの提案（`cardsHint`）：3 つか 4 つの短い同じ重さの要点で出る。項目が 2 つ・5 つ、長い項目、長さの違う項目、入れ子の箇条書き、`ol`、パーツ、`static`、縦組み、表紙では出ない。情報だけで修正依頼に入らない |
| `node tools/test-check-predict.mjs [作業フォルダ]` | 予想の警告（`predictAnswerWithCount`・`predictAnswerNeverShown`）：`answer-step` の読み方（`m-predict` と同じ）、前者は `1`・`-1`・`1.4` で出て、属性なし・`0`・`2`・`3`・`abc`・空では出ない。後者は `steps` が答えのステップより小さいときに出る（そのときは前者の代わり）。`npm run check` と編集アプリの道筋（`sourceFindings`）が同じ指摘を出す。修正依頼に R-steps と一緒に入る。日本語と英語の言葉 |
| `node tools/test-themes.mjs [作業フォルダ] [--shots <フォルダ>]` | 同梱のどのテーマでも、サンプルの教材が組めて品質チェックを通る。役割の色のコントラスト・色覚の模擬・ペンの色（[テーマ](#テーマ)）。`tokens.css` の `look` の形が `kit/core/theme-shapes.mjs` と同じ。数字の表を出し、`--shots` ならテーマごとの 1 枚の画像も |
| `node tools/test-fonts.mjs [作業フォルダ]` | 字体：選んだ字体だけが入る（`theme.json` の `fonts` か CSS の名指し）、英語の教材と日本語の教材の `<em>`・`<i>` の中のラテン文字の Source Sans 3 の斜体、ファイルに入っていない字体の `fontNotEmbedded` |
| `node tools/pdf.mjs <組んだ.html> <出力.pdf>` | PDF。1 枚 1 ページ |
| `node tools/shot.mjs <組んだ.html> <出力.png> [i] [k] [mode]` | スライド i（0 始まり）、ステップ k の最終状態の PNG |
| `npm run sheet -- <作業フォルダ \| deck.html \| 組んだ.html \| .ega.html> [out.png] [--mode talk] [--cols 4] [--width 640] [--tiles] [--steps]` | コンタクトシート：全スライドの最終ステップを 1 枚の PNG に（番号は 1 始まり、鍵が短ければ併記。タイルの幅は既定 640 px。出力は `<教材>/out/sheet.png`）。`--tiles` で 1 枚ずつの PNG を `<out>-tiles/` にも書く。`--steps` を付けると、図かパーツのあるスライドだけ、全ステップを横に 1 行（1 スライド 1 行）に並べる（図の約束をステップごとに確かめる。タイルの幅は既定 320 px、出力は `<教材>/out/steps.png`）。出力の場所と枚数を印字する |
| `npm run comment-shots -- <作業フォルダ \| deck.html> [id …] [--all]` | `comments.json` の未対応のコメント（id を並べればそれだけ、`--all` なら全部）ごとに、そのステップの最終状態にピン（と手書きの線を全部）を描いた PNG：`<教材>/.cache/comment-shots/<id>.png`（ピンの周りのスライドの 480×300 を 2 倍で。線があれば少なくとも全部の線の外接矩形＋48 px。ピンがなければスライド全体）、`<id>-full.png`、`index.json`。ステップがなくなったコメントは撮らずに知らせる |
| `node tools/catalog.mjs` | `vendor/components/CATALOG.md` を作り直す |
| `npm run components:update -- vX.Y.Z [--from <フォルダ>]` | egatari/components のリリースを `vendor/components/` と `components.lock.json` に取り込む（`manifest.json` の sha256 で確かめる。バージョンは置き換えない） |
| `npm run components:check` | `vendor/components` が `components.lock.json` と合うか（ネットワークなし） |
| `node tools/narration-json.mjs <narration.md> [--voice json]` | 台本を解析した JSON（`synth.py` が使う） |
| `node tools/smoke.mjs <組んだ.html> <フォルダ>` | タイムラインといくつかの画面 |
| `node tools/test-components.mjs [名前 …] [--shots フォルダ]` | パーツのデモを組んで確かめる |
| `node tools/test-tools.mjs <組んだ.html> [フォルダ]` | 一覧・ペン・レーザーポインター・印刷・発表者ビューからの書き込み |
| `node tools/test-controls.mjs <組んだ.html> [フォルダ]` | ツールバー・キーの一覧・発表者ビューのボタン |
| `node tools/test-autoplay.mjs <組んだ.html>` | 自動再生と発表者ビューのボタン |
| `node tools/test-links.mjs [フォルダ]` | スライドへのリンク：開いたときの #・モードごとのクリック・戻る（ボタン・キー・ブラウザの履歴）・自動再生を保つこと・埋め込み（`cause: "link"` の `position`、`linkRefused`）・発表者ビュー・`m-menu`・品質チェックのエラー |
| `node tools/test-dev-server.mjs [作業用のフォルダ]` | `examples/minimal` の写しで開発サーバーを確かめる |
| `node tools/flake.mjs <組んだ.html> <i> <k> <フォルダ>` | 「呼び出し順に依存」の誤検出を調べる |

## 環境変数

| 変数 | 使うもの | 意味 | 既定 |
|---|---|---|---|
| `CHROME_PATH` | 品質チェック・PDF・shot・動画のエクスポート・テスト | ブラウザの実行ファイル | Google Chrome、なければ Microsoft Edge、それもなければ Playwright の Chromium |
| `IRODORI_URL` | TTS | OpenAI 互換の音声合成サーバー | `http://localhost:8882`（既定） |
| `IRODORI_REF_DIR` | TTS | 参照音声のフォルダ（`--ref-dir` が優先） | `tts/voices/` |
| `MOTION_YOMI` | TTS | 読み辞書（`--yomi` が優先） | `tts/yomi.yaml` |
| `EGATARI_THEMES` | 組み立て・品質チェック・開発サーバー・Egatari ファイル | 自分のテーマのフォルダ。作業フォルダの後、同梱の `themes/` の前に探す（[テーマ](#テーマ)）。区切りは `:`（Windows は `;`） | なし。あれば、その後に `~/.egatari/themes` を探す |
