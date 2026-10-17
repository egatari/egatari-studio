# リファレンス

[English](reference.md) | 日本語

使える選択肢・記法・キーを、コードから拾って 1 行ずつ並べたもの。理由と厳密な規則（位置と時刻、タイムラインの式、注目の演出、モーフ）は [contract.ja.md](contract.ja.md)。手順の説明は [README](../README.ja.md)、[dev-server.ja.md](dev-server.ja.md)、[video.ja.md](video.ja.md)。

目次：[原稿の記法](#原稿の記法) · [口述原稿](#口述原稿narrationmd) · [長さ](#長さtimelinejson) · [テーマ](#テーマ) · [部品](#部品) · [発表](#発表) · [開発サーバー](#開発サーバー) · [検査器](#検査器) · [build](#build) · [TTS](#tts) · [書き出し](#書き出し) · [道具](#道具) · [環境変数](#環境変数)

## 原稿の記法

### 原稿のフォルダのファイル

| ファイル | 読むもの | 用途 |
|---|---|---|
| `deck.html` | build | スライド（名前は自由。雛形は `examples/minimal/deck.html`） |
| `narration.md` | build・TTS・書き出し | 段階ごとの口述原稿 |
| `timeline.json` | build | 段階の長さの例外 |
| `macros.tex` | build | KaTeX のマクロ（`\newcommand`、`\renewcommand`、`\def`。既定のマクロに足す） |
| `audio/manifest.json` | build | `tts/synth.py` が書く |
| `voice.json` | TTS | 声・言語・エンジン |
| `figs/*.svg`、`data/*.json` | build | `{{FIG:…}}` / `{{JSON:…}}` の元 |
| `components/<名前>/index.js` | build | デッキ専用の部品（リポジトリより先に探す） |
| `themes/<名前>/` | build | デッキ専用のテーマ |
| `comments.json`、`.cache/edits/` | 開発サーバー | 開発サーバーが書く |
| `out/<名前>.html` | — | build の既定の出力 |

### スライドとクラス

| 書き方 | 意味 |
|---|---|
| `<div id="stage">` の中の `<section class="slide">` | 1 枚（1280×720）。`<h2>` 見出し、`<div class="body">` 本文、`<div class="concl"><span>…</span></div>` 結論の行 |
| `class="slide cover"` | 表紙：`.venue`、`<h1>`、`.au`。テーマのロゴが左下に入る |
| 表紙に `data-nologos` | この表紙にはロゴを入れない（表紙に `.logos` の要素が既にあるときも入れない） |
| `class="slide sec"` | 章の扉（`<h1>`、`.lead`）。動画の `--full` の章の始まり |
| `class="slide sec appendix"` | 付録の扉。以降のページ番号は「付録」/ Appendix。`appendix` がなくても、文字に「付録」か Appendix を含む `sec` は付録の扉とみなす |
| `class="… static"` | 段階なし：全部見せる。`.concl` も別の段階にしない |
| `class="… nostep"` | 箇条書きを自動で段階にしない |
| `class="… noconcl"` | 結論の行なし：本文は 565px でなく 680px まで使える |
| section の `id="…"` | スライドの鍵（見出しより優先）。見出しが重なるときに付ける |
| `data-morph` / `data-morph="鍵"` | 前のスライド / その鍵のスライドからモーフで入る（[contract §8](contract.ja.md#8-モーフdata-morph)） |
| `data-chapter="名前"` | ここから章を始める（`sec` と同じ扱い。章の名前を指定） |
| `data-steps="n"` | 段階の数の下限（旧形式の `data-anim` 用） |
| `data-anim="名前"` | 旧形式の動き：`DECK.ANIM[名前](slide, k, instant)` を呼ぶ。動画では各段階の最終状態だけになる。新しく書くなら部品にする |
| 直下の子に `<div class="pn">` | ページ番号を自分で書く（なければ 2 枚目から `i/N` が入る） |
| `<html lang="en">` | 英語のデッキ：本文は Source Sans 3、画面の言葉は英語、検査は英語の規則、TTS は `voxcpm2` |
| `<html data-theme="名前">` | テーマ（`--theme` が優先） |
| `<html data-mode="lecture">` | URL に `?mode=` がないときのモード |
| `<html data-feedback-url="URL">` | 「フィードバックを送る」の宛先（既定 `https://github.com/moiku/motion-academic-slides/issues/new`）。GitHub の `/issues/new` なら `template=feedback.yml` を足す。`version` `browser` `os` `context`（言語・モード）を URL の引数として付ける |
| `<html data-feedback="off">` | `?` の一覧と発表者ビューにフィードバックのリンクを出さない（`DECK.FEEDBACK_URL = null`） |

本文のクラス（色はすべてテーマから）：`.sub` 小見出し · `.big` 主要な式 · `.note` 補足（27px） · `.thm` 定理の枠 · `.box` 淡色の枠 · `.cols` 横並び · `.arrow` 中央の矢印の行 · `.fig` / `.figcap` 図とキャプション · `.cite` 出典（20px） · `.plot` `DECK.Plot` の箱 · `.readout .num` 桁をそろえた数 · `td.r` 右寄せのセル · `.term`/`.blue`、`.emph`/`.red`、`.muted`/`.gray`、`.b` 色と太字。

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
| `data-key`、`data-title` | build が付ける（スライドの鍵、タグなしの見出し）。section に手で `data-key` を書けば、それを鍵に使う（`id` より優先）。[スライドの鍵](#スライドの鍵) |

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
| KaTeX のエラー | build が警告し、元の式を赤で出す（`.katex-error`）。検査器はエラーにする |
| 部品や原稿のスクリプトで `DECK.svgMath(…)` | 実行時にも KaTeX を埋め込む（マクロも同じ） |

### 埋め込み

| 書き方 | 意味 |
|---|---|
| `/*INCLUDE:ファイル*/` | ファイルの中身をそのまま入れる（原稿のフォルダ → `kit/` の順に探す）。そのフォルダの外を指すもの（`../`、絶対パス、シンボリックリンク）は警告して読まず、空にする |
| `{{FIG:名前}}` | `figs/名前.svg`（なければ原稿のフォルダの `名前.svg`）を埋め込む。id に `名前-` を前置し、width・height を外す |
| `{{JSON:ファイル}}` | `data/`（なければ原稿のフォルダ）の JSON を詰めて入れる。部品の子の `<script type="application/json">` に置くと `this.data` で読める |
| `<m-名前 …>` | 部品。`components/名前/index.js` を自動で読み込む |

`{{FIG:…}}`・`{{JSON:…}}`・`narration.md`・`timeline.json`・`macros.tex`・`audio/manifest.json` の中のファイルも、（シンボリックリンクをたどった先が）原稿のフォルダの中にあるときだけ読む。外なら警告（`refused: …`）して飛ばす。

### 素材（build で埋め込む）

| 参照 | 埋め込み方 |
|---|---|
| `<img src>`、`<source src/srcset>`、`<img srcset>`、`<video src/poster>`、`<audio src>`、`<track src>`、SVG の `<image href>` | `data:` URI |
| 原稿の `<style>` と `style=""` の中の `url(…)`・`@import` | `data:` URI／取り込む CSS の中身（リンクや @import した CSS の中の `url()` はその CSS からの相対） |
| `<link rel="stylesheet" href="file.css">` | 中身を入れた `<style>` |
| `<link rel="icon">` などほかの `<link>` のファイル、`<script src="file.js">` | `data:` URI／中身を入れた `<script>` |

相対パスは原稿のフォルダから解決し、フォルダの外は読まない。`data:`・`blob:`・`#断片`・テンプレートの値（`${…}`、`{{…}}`）はそのまま。警告：`missing: …`（ファイルがない）、`refused: …`（原稿のフォルダの外）、`external: …`（素材の位置にある `http(s)` の参照。`<iframe>`・`<object>` を含む。そのまま残すので、オフラインでは出ない）。ふつうのリンク（`<a href>`）は触らない。`audio/manifest.json` の音声は `--embed-audio` のときだけ埋め込む。

### スライドの鍵

スライドごとに、デッキの中で重ならない鍵を 1 つ付ける：`data-key`、なければ `id`、なければ見出しを整えたもの、なければ `s<番号>`。明示の鍵（`data-key`／`id`）を文書の順に先に押さえる。明示の鍵が重なれば警告（`slide key: …`）し、後のスライドに `#2`、`#3`、… を付ける。見出しや番号から作る鍵は、明示の鍵とも既にある `#n` の鍵とも重ならないよう、次の空いた `#n` を付ける。決まった鍵は section の `data-key` に書く（手で書いた `data-key` も、変えたときは書き換える）。`narration.md` の見出し（`## 鍵`）はこの鍵を使う。

## 口述原稿（narration.md）

| 書き方 | 意味 |
|---|---|
| `## 見出し` | スライド：見出しの文字列（タグと空白を除く）か section の `id` |
| `## 見出し#2` | 同じ見出しの 2 枚目（3 枚目は `#3`）。`id` を付けるほうがよい |
| `[0]` `[1]` … `[concl]` | その段階の原稿。続く行は同じ段階 |
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

build は、どのスライドにも合わない `##`（検査器ではエラー）、無い効果の名前、原稿に無い目印を警告する。

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

決め方：`--theme` > `<html data-theme>` > `default`。名前は、原稿のフォルダからの相対パス → `<deck>/themes/<名前>/` → `themes/<名前>/` の順に探す。フォルダには `tokens.css` が要る。

| `theme.json` の項目 | 意味 |
|---|---|
| `extends` | 親のテーマ：その `tokens.css` を先に置く（このテーマの隣 → `themes/` の順に探す） |
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

字：日本語のデッキ（`lang` が `ja` か、ない）は BIZ UDPゴシックを埋め込む。ほかの言語は Source Sans 3 を埋め込み、U+024F より後ろの字だけを BIZ UDPゴシックで補う。埋め込むのは使っている字を含む分割ファイルだけ（`fonts/*.ttf` と uv があれば使っている字だけ）。

## 部品

部品の一覧と受け取る値は [components/CATALOG.md](../components/CATALOG.md)（各 README の frontmatter から `node tools/catalog.mjs` が作る）。部品の書き方（`DECK.define`、`DECK.MotionElement`、`static steps`、`static props` の `type: number | bool | json | string`、`mount`、`duration`、`cues`、`render`）は [contract §3](contract.ja.md#3-部品web-components) と [skills/motion-components](../skills/motion-components/SKILL.md)。

部品が使える `DECK` の道具：`el(tag, attrs, parent)`（SVG。`var()` の色は `style` に回す）、`mtext(parent, x, y, "*x*_0", attrs)`、`svgMath(parent, x, y, tex, {size, anchor, color, w, h})`、`Plot(box, {xr, yr, xt, yt, xf, yf, xl, xl2, yl, noY, m})`（`.x() .y() .d(f, a, b, n) .poly(pts) .clip`）、`prog(t, start, dur)`、`lerp`、`ease`、`clamp01`、`color(名前)`。

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
| Tab / Shift+Tab | 操作の帯のボタンを選ぶ（Enter / Space で押す。Esc でスライドに戻る） |
| Esc | 道具を解除、キーの一覧を閉じる |
| ? | キーの一覧（`server/dev.mjs` で開いたときは開発サーバーのキーも） |

### 操作の帯（マウスを動かすと出て、2.5 秒で隠れる）

ボタン：前へ、次へ、自動再生・停止、レーザー、ペン、消えるペン（ペンの 2 つは右上の点が今の色。ペンの間は後ろに赤・青・黒の色のボタンが出て、押すとその色になる。選んでいる色は aria-pressed）、書き込みを消す（道具によらずこのスライド）、一覧、授業モード、字幕、発表者ビュー、全画面、キーの一覧。Tab で帯に入れ（フォーカスがある間は隠れない）、Enter / Space で押すとフォーカスはそのボタンに残り、Esc でスライドに戻る。マウスで押したときはフォーカスを残さない。スライドの下に 44px 以上の余白があれば余白に、なければ下端に重ね、そのときはマウスが下のほうに来たときだけ出す。印刷と動画には出ない。

`?` の一覧の下に「フィードバックを送る」のリンクと版（例：`v0.2.0`）がある。版・ブラウザ・OS・デッキの言語・モードだけを入れたフィードバックの form を開く。デッキの中身は送らない。動画・印刷・`data-feedback="off"` のときは出ない。

### 字幕

`s`・CC のボタン・`?captions=1` で、今の段階の口述原稿（`narration.md` の表示用の文字。読みと `{mark}` は除く）をスライドの下端の帯に出す。地は `--fg`、文字は `--bg`（検査器がこの 2 色のコントラスト 4.5:1 以上を見ている）。段階を文のまとまり（2 行ほど。字が大きいほど短い。長すぎる文は読点や語の切れ目で分ける）に分け、1 つずつ出す。1 まとまりは `--cap-max-lines` 行（3）までで、超えたら後ろの行を見せる。手で送っている間（と音声のない自動再生）は、読む速さ（ja 7 字/秒、en 15 字/秒。`--cap-rate` か `DECK.captionRate`）で次のまとまりに進め、段階が変わると最初から、最後のまとまりはそのまま残す。音声つきの自動再生と `?mode=video&captions=1` では、字数に比例して音声の時間を割り振って順に出す（動画で音声がなければ全部を出す）。大きさは `Shift+s`・`?capsize=`・テーマの `--cap-size` で変える。動画では `(i, k, t)` だけで決まる。印刷には出さない。`render/render.mjs` は字幕なしの `?mode=video` で開くので、焼き込むならそこに引数を足す。

### 読み上げとキーボード（アクセシビリティ）

`?mode=video` と発表者ビューの中の画面では足さない。どれも画素は変えない。

- 読み上げソフト：画面に出ない `aria-live="polite"` の領域（`#deck-live`）が、スライドが変わると「スライド n / N：タイトル」、次の段階では新しく出た段階の文字（式は KaTeX の字から）、戻ったときや文字の無い段階では「段階 k / K」を知らせる。スライドは `role="group"`・`aria-roledescription="スライド"`・`aria-label` を持ち、隠れたスライドは `aria-hidden="true"` と `inert`。発表ではまだ出ていない段階も `aria-hidden`（授業モードでは読める）。
- キーボード：操作の帯と発表者ビューのボタンは `aria-label`（`<html lang>` に従って日本語か英語）、切り替えのボタンは `aria-pressed` を持ち、フォーカスの枠は `:focus-visible` のときだけ出す。一覧は `dialog` で、縮図は名前つきのボタン。矢印で選ぶとフォーカスも動き、Esc で閉じると元のフォーカスに戻る。キーの一覧（`?`）も `dialog` で、開くとフォーカスが入り、閉じると戻る。書き込みの面は `aria-hidden` でフォーカスを取らないので、描いている間も Tab と Esc が効く。
- `prefers-reduced-motion` では各段階を最終状態で見せる（動画を除く）。
- 検査器は `alt` の無い `<img>`（飾りなら `alt=""`）と、`aria-label` / `aria-labelledby` / `<title>` の無い SVG の図を警告し、名前の無い部品を情報として挙げる。

### 発表者ビュー

今の画面（左）、次の段階（右上）、今と次の段階の口述原稿（右下。Novice の発言には印）、スライドと段階の番号、自動再生のボタン、道具のボタン（レーザー・ペン・消えるペン・消す・一覧・授業モード。ペンの間は本体と同じ赤・青・黒の色のボタン。本体とは色の番号でやり取りするので食い違わない）、経過時間と戻すボタン（⟲）、時刻。発表者ビューで効くキー：→ ↓ Space PageDown / ← ↑ PageUp、a、x、d、v、Shift+d、Backspace、Esc、o、l。左の画面に描いた線は本体に出る。`postMessage` でやり取りするので `file://` でも動く。キーの行の右端に「フィードバックを送る」のリンク（`?` の一覧と同じ）。

### 印刷と PDF

印刷（`tools/pdf.mjs` かブラウザ）では、各スライドを最終状態で 1 ページ（1280×720）ずつ出す。印・書き込み・道具・進み具合の帯は出さない。

### 実行時の API（スクリプトと検査用）

`DECK.seek(i, k, t, from)`、`go(i, k, animate)`、`next()`、`prev()`、`state()` → `{slide, step, max, key, mode}`、`timeline()`、`autoplay(on)`、`stepKey(i, k)`、`marks(i, k)`、`morph(i)`、`slides`、`mode`、`ready`、`NARRATION`、`AUDIO`、`MARKS`、`TIMING`、`VERSION`（`package.json` の `version`。build が埋め込む）、`FEEDBACK_URL`（または `null`）、`feedbackUrl()`（欄を埋めた form の URL。または `null`）、`tools.{mode, setMode, clear, help, overview, color}`（`color()` はペンの色の番号 0〜2、`color(n)` で変える）、`captions(on)`（引数なしなら入か切か）、`captionSize(z)`（`"s"` / `"m"` / `"l"`。引数なしなら今の大きさ、動画では `null`）、`captionRate`（字/秒）、`toast(msg)`（短い知らせ）、`caption()`（出ている字幕の文字。無ければ `null`）、`announce()`（aria-live の領域の文字）。`document` のイベントには `deck:captions`（`detail = {on}`）もある。`document` のイベント：`deck:ready`、`deck:pos`（`detail = {i, k, max, n, key, nextKey, auto}`）。

## 開発サーバー

`node server/dev.mjs <deck.html> [--port 8730] [--theme 名前]`（`npm run dev -- …` でも）。詳しくは [dev-server.ja.md](dev-server.ja.md)。

| 項目 | ふるまい |
|---|---|
| `--port n` | 既定 8730。使われていれば次の番号を順に試す（20 回まで）。`--port 0` は空いている番号 |
| `--theme 名前` | build と同じ |
| 待ち受け | 127.0.0.1 だけ |
| 組み直すきっかけ | 原稿、`narration.md`、`timeline.json`、`macros.tex`、`audio/manifest.json`、`data/`、`figs/`、`components/`、リポジトリの `kit/`、`components/`、`themes/`。同じスライド・段階のまま読み込み直す |
| 開発用の build | 字を絞らない（速い）、直せる要素に `data-src`、音声は `/deck/audio/…`、組み立ての失敗は画面に出す |
| `e` | 編集モード。`h1 h2 p li td th`、`.big .note .sub .venue .au .thm .box .lead`、`.concl` の中の `span` をダブルクリック。⌘/Ctrl+Enter で保存、Esc で取消。build の警告の数を札に出す |
| `n` | 今の段階の口述原稿の引き出し（次の段階も表示） |
| `c` | 指示の一覧。クリックでそのスライドへ、「解決」で閉じる |
| Alt+クリック（Mac は ⌥ option+クリック） | Claude Code への指示を残す |
| 衝突 | 開いた後に原稿が変わっていれば保存しない |
| 書き換えるファイル | `deck.html`（直した要素だけ）、`narration.md`（その段階だけ）、`comments.json`、`.cache/edits/`（新しい 30 個） |
| 口 | `GET /`、`/deck/<ファイル>`、`/__dev/client.js`、`/__dev/events`（SSE）、`GET /__dev/source?range=a-b`、`POST /__dev/edit`、`GET`/`POST /__dev/narration`、`GET /__dev/comments`、`POST /__dev/comment`、`POST /__dev/comment/resolve` |

## 検査器

`node kit/check.mjs <deck.html> [--theme 名前] [--json]`。メモリ上で build し、ヘッドレス Chrome で開いて、スライドごとに結果を出す。エラーが 1 つでもあれば終了コード 1。`--json` は `{ok, counts, results: [{slide, title, sev, msg}]}`。`--theme` で別のテーマで確かめられる（なければ `<html data-theme>`）。

| 検査 | 重さ |
|---|---|
| build の警告。どのスライドにも合わない口述原稿の `##` | 警告。エラー |
| コンソールのエラー | エラー |
| 段階 0 で見えている本文 | 情報 |
| タイトルが 26 字（全角）を超える（日本語）/ 60 文字を超える（英語） | エラー / 警告 |
| タイトルがコロンで終わる | エラー |
| 結論の行が 35 字を超える（日本語）/ 70 文字を超える（英語）。結論が枠からはみ出す | エラー / 警告。エラー |
| 本文が 565px（`noconcl` は 680px）より下、1236px より右に出る | エラー |
| 本文の字が 27px 未満、表・図の字が 24px 未満、SVG の字が 24px 未満（見出しに「文献」を含むスライドは除く） | エラー |
| 本文の「です・ます」（日本語） | エラー |
| 組まれていない式、KaTeX のエラー | エラー |
| デッキの中で「、。」と「，．」が混ざる（日本語） | 警告 |
| 口述原稿のない段階 | 警告 |
| 式を読み上げている口述原稿 | 警告 |
| 1 ターンが 200 字 / 60 語を超える | 情報 |
| `--fg --term --emph --title --accent2` と `--bg` のコントラストが 4.5:1 未満。`--muted` が 3:1 未満 | エラー。警告 |
| 部品の描画が呼び出し順で変わる | エラー |
| 注目の演出の目印が無い。段階ごとの印の一覧 | 警告。情報 |
| モーフ：元のスライドが無い、同じ `data-id` が無い、ID の重複。対応の一覧 | 警告。情報 |
| `alt` の無い `<img>`、`aria-label`・`<title>` の無い SVG の図、名前の無い部品 | 警告、警告、情報 |
| タイムラインの合計と 1 枚ごとの長さ | 情報 |

## build

`node kit/build.mjs <deck.html> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio]`（`npm run build -- …` でも）。

| 選択肢 | 意味 |
|---|---|
| `-o ファイル` | 出力（既定 `<原稿のフォルダ>/out/<名前>.html`） |
| `--theme 名前` | テーマ（[テーマ](#テーマ)） |
| `--dev` | 編集用の `data-src` を付け、字を絞らない（開発サーバーが使う） |
| `--embed-audio` | 音声を AAC 64 kbps モノラルで埋め込む（ffmpeg が要る。なければ WAV のまま、警告）。なしでは出力からの相対パスで参照する |

最後の行に、スライド・式・部品・字のファイル・口述原稿の段階・音声の段階・テーマ・大きさを出す。キャッシュ：絞った字は `$TMPDIR/motion-slides-fonts/`（使う字・TTF のハッシュ・fonttools の版で鍵を作る。`uv` で `fonttools==4.67.0` と `brotli==1.2.0` を使う）、圧縮した音声は `$TMPDIR/motion-slides-audio/`。埋め込む字：HTML の文字参照と `\u` エスケープをほどいた原稿の字、`<script type="application/json">` と口述原稿の文字列、使う部品の JS の文字列（日本語以外のデッキでは和文を除く）、印字できる ASCII（数字、ページ番号の `/`）、`Appendix`、日本語のデッキではさらに `付録` とよく使う和文の約物。ローカルの素材は[素材](#素材build-で埋め込む)のとおり埋め込む。

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

| `voice.json` の項目 | 意味 |
|---|---|
| `expert`、`novice` | 名前（`<参照音声のフォルダ>/<名前>.wav`）かパス（`/` を含むか `.wav` で終わる。相対ならデッキから）。既定 `bob`、`alice` |
| `lang` | 言語（既定はデッキの HTML の `lang`。渡したファイル、`<deckdir>/deck.html`、フォルダに 1 つだけある `*.html` の順。なければ `ja`） |
| `engine` | `irodori`（日本語の既定）か `voxcpm2`（それ以外の既定） |

`audio/seg_<digest>.wav`、`audio/seg_<digest>.json`、`audio/manifest.json` を書く（原稿から消えた段階は manifest から外す。wav は残す）。dry-run の音声が残っていれば警告する。サーバーが localhost でなければ、声のパスを手元で確かめない。終わったら build し直す。

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

出力：`clip_NNNN.mp4`、`clip_NNNN.png`、`timeline.out.json`（`source, fps, scale, width, height, duration, clipDuration, segments[]`。各段階は `index, clip, still, key, slideKey, stepKey, i, k, title, chapter, start, dur, anim, lead, audioDur, frames, clipDur, clipStart, start_ms, end_ms, transcript, text`）、`.render-cache.json`。段階の数より後ろのクリップは消す。

`node render/export-canon.mjs <deckdir | 組んだ.html> --render <フォルダ> --out <バンドル> [--md 名前.md] [--canon フォルダ]`

| 選択肢 | 意味 |
|---|---|
| `<deckdir \| 組んだ.html>` | 組んだファイルなら、そのフォルダか 1 つ上の `narration.md` を使う |
| `--render フォルダ` | `render.mjs` の出力 |
| `--out フォルダ` | バンドル：`<md>`、`clips_per_page/`、`stills/`、`timeline.out.json` |
| `--md 名前` | md のファイル名（既定 `<デッキの名前>_with_narration.md`） |
| `--canon フォルダ` | canon のリポジトリ。bun で canon の parser の検査をする（`CANON_DIR` より優先）。なければ飛ばす |

エラー（80 MB を超えるクリップ、話者のない行）なら終了コード 1。口述原稿・静止画がない、dry-run の音声が残っていれば警告。canon への投入のコマンドを出す。

## 道具

| コマンド | 用途 |
|---|---|
| `npm run new -- <フォルダ> [--lang en\|ja] [--theme 名前] [--title "…"]` | きれいな雛形から新しいデッキのフォルダ（`deck.html` と `narration.md`）を作る。空でないフォルダには書かない |
| `npm run build:app` | 編集アプリを作る：`dist/editor/`（GitHub Pages 用）と 1 ファイルの `dist/editor.html`。[editor.ja.md](editor.ja.md) |
| `node tools/test-app.mjs` | 編集アプリのテスト（OPFS のフォルダ、編集、口述原稿、指示、外での変更、書き出し、発表者ビュー） |
| `node tools/get-fonts.mjs` | BIZ UDPゴシックの TTF を `fonts/` に取ってくる（uv で使っている字だけに絞れるようになる） |
| `node tools/pdf.mjs <組んだ.html> <出力.pdf>` | PDF。1 枚 1 ページ |
| `node tools/shot.mjs <組んだ.html> <出力.png> [i] [k] [mode]` | スライド i（0 始まり）、段階 k の最終状態の PNG |
| `node tools/catalog.mjs` | `components/CATALOG.md` を作り直す |
| `node tools/narration-json.mjs <narration.md> [--voice json]` | 口述原稿を解析した JSON（`synth.py` が使う） |
| `node tools/smoke.mjs <組んだ.html> <フォルダ>` | タイムラインといくつかの画面 |
| `node tools/test-components.mjs [名前 …] [--shots フォルダ]` | 部品の見本を組んで確かめる |
| `node tools/test-tools.mjs <組んだ.html> [フォルダ]` | 一覧・ペン・レーザー・印刷・発表者ビューからの書き込み |
| `node tools/test-controls.mjs <組んだ.html> [フォルダ]` | 操作の帯・キーの一覧・発表者ビューのボタン |
| `node tools/test-autoplay.mjs <組んだ.html>` | 自動再生と発表者ビューのボタン |
| `node tools/test-dev-server.mjs [作業用のフォルダ]` | `examples/minimal` の写しで開発サーバーを確かめる |
| `node tools/flake.mjs <組んだ.html> <i> <k> <フォルダ>` | 「呼び出し順に依存」の誤検出を調べる |

## 環境変数

| 変数 | 使うもの | 意味 | 既定 |
|---|---|---|---|
| `CHROME_PATH` | 検査・PDF・shot・書き出し・テスト | ブラウザの実行ファイル | Google Chrome、なければ Microsoft Edge、それもなければ Playwright の Chromium |
| `IRODORI_URL` | TTS | OpenAI 互換の音声合成サーバー | `http://localhost:8882` |
| `IRODORI_REF_DIR` | TTS | 参照音声のフォルダ（`--ref-dir` が優先） | `tts/voices/` |
| `MOTION_YOMI` | TTS | 読み辞書（`--yomi` が優先） | `tts/yomi.yaml` |
| `CANON_DIR` | export-canon | canon のリポジトリ（`--canon` が優先） | なし（検査を飛ばす） |
