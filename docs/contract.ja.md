<!-- i18n: pair=contract.md sha256=6ef1b8771f5285be -->
# 約束事（実行系・部品・口述原稿・タイムライン）

[English](contract.md) | 日本語

このリポジトリのすべての部品は、この文書の約束に従う。変えるときはこの文書を先に直す（英語版の [contract.md](contract.md) も）。
選択肢・記法・キーの一覧は [reference.ja.md](reference.ja.md)（[English](reference.md)）。

## 1. 位置と時刻

発表中の「位置」は (スライド i, 段階 k, 段階の開始からの秒数 t) の 3 つで決まる。

- 段階 0 はスライドに入った直後。`data-step="k"` の要素は段階 k で現れる。結論の行（`.concl`）は自動で最後の段階になる
- **画面は (i, k, t) だけで決まる**。実時間の時計、`setTimeout`、`requestAnimationFrame`、シードのない乱数を部品の中で使ってはいけない
- t = Infinity はその段階の最終状態（戻る・ページ指定・印刷・動画の静止区間）
- 実行系は 1 か所（`DECK.seek(i, k, t)`）で画面を描く。手動の発表では実時間を、動画の書き出しでは仮想の時刻を渡す

- 段階 0 でスライドが切り替わる途中（`seek(i, 0, t, from)`）は、前のスライド `from` を最終状態で下に描く。`data-morph` のスライドに元のスライドから入るときは、重ねて薄れる代わりにモーフになる（§8）
- 画面を撮る側（動画の書き出し・品質チェック）は、`seek` の後に `requestAnimationFrame` を 2 回待ってから撮る（描画が反映される前の画面を撮らないため）
- テーマの色は `oklch()` や `color-mix()` で書かれているので、`getComputedStyle` の値は rgb にならないことがある。数値が要るときは canvas に塗って読む

## 2. 表示モード

`?mode=talk|lecture|video`（既定は `talk`）。`data-step` は共通で、見せ方だけが変わる。

| モード | 段階より後の要素 | 今の段階の要素 |
|---|---|---|
| talk（発表） | 隠す | 現れる（フェードと上への移動） |
| lecture（授業） | 薄く見せる | 強調する（`.cur`） |
| video（動画） | talk と同じ。タイムラインで自動に進む | |

## 3. 部品（Web Components）

```js
DECK.define("m-sweep", class extends DECK.MotionElement {
  static steps = 2;                         // 部品の段階数（属性 steps で上書きできる）
  static props = {                          // 受け取る値の宣言（部品一覧の自動生成に使う）
    from: {type: "number", default: 0, doc: "始めの値"},
  };
  mount(ctx)       { /* 1 回だけ。SVG や要素を作る */ }
  duration(k)      { return 1.2; }          // 段階 k の動きの長さ（秒）
  cues(k)          { return null; }         // 段階 k の中の同期点（秒の配列）。口述原稿のその段階の {cue} 1 つにつき 1 つ（先頭の 0 は書かない）
  render(k, t, ctx){ /* 段階 k の開始から t 秒後の状態を描く。t = Infinity なら最終状態 */ }
});
```

- 部品の段階はスライドの段階 `data-from`（既定 1）から始まる。スライドの段階 K のとき、部品の段階は `k = clamp(K - from + 1, 0, steps)`。部品の段階の範囲の外では t = Infinity で呼ばれる
- 実行系は、舞台が並べ終わってから `mount` を呼ぶ。部品は `mount` で自分の大きさ（`clientWidth`・`getBoundingClientRect`）を読んでよい。並んでいないうちに起動したとき（`display:none` の iframe の中、後で出すタブの中）は、舞台に大きさが付き、並べたことで読み始めた字（Web フォント）を読み終えるまで待ってから mount し、開いたときの位置（と、待つ間に頼まれた `DECK.seek`）を描く。`DECK.ready` と `deck:ready` はその後。起動のときに並んでいるデッキは、これまでどおりすぐに mount する
- `render` は**同じ (k, t) なら必ず同じ画面**にする。前回の呼び出しの状態に頼らない（戻る・飛ぶ・動画の書き出しで順番が変わるため）
- `ctx = {mode, slide, instant, deck, reset?}`（`reset` は次の項目）。`ctx.mode === "lecture"` のときは最終状態を見せて今の段階を強調する、などを部品が選べる
- 部品は、段階の間に見ている人が手で変えられるようにしてよい：押したときに札を重ねて出す（`m-kobun` の活用表）、模型を回す、値をずらす。その状態は (i, k, t) に入らない（format spec §8.4）：`?mode=video` では開かず、印刷に出さず、ネットワークから何も取らず、中身は文字だけにし、**段階に入るたび（同じ段階に入り直すときも）、部品は `render(k, t)` の描く画面に戻る**。部品は、変えたときと違う k で `render` が呼ばれたとき、または `ctx.reset === true` で呼ばれたときに、その状態を捨てる。実行系は、部品の中で `pointerdown`・`keydown`・`wheel`・`input`・`change` が起きると触った印を付け、次に段階に入るとき（`DECK.seek`・`DECK.go`・リンク・発表者ビューからの操作・印刷。その段階の実時間の再生の 2 コマ目からは除く）に、別の段階（t = Infinity）を描いてから、`ctx.reset = true` を付けて (k, t) を描く。触っていない部品はこれまでどおり 1 回だけ描くので、動画のコマも送りの手間も変わらない。こうして動画・印刷・発表者ビューはいつも宣言どおりの画面になる（発表者ビューは位置だけを受け取る別の文書）
- **色はテーマの CSS 変数だけ**を使う：`var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`。SVG では属性ではなく `style="stroke:var(--emph)"` で書く（`DECK.el` は `fill` `stroke` に `var(` があれば自動で style に回す）
- 数値データは検算済みのスクリプトの出力だけを使う。`<script type="application/json">{{JSON:file.json}}</script>` を部品の子に置くと `this.data` で読める（直接の子にちょうど 1 つ。2 つ以上あれば `this.data` は `null` で、デッキは自前のコードを持つものとして扱う）
- データの形は `static shape` に書く（`kit/shape.js`：JSON Schema の小さな部分集合で `{schema, example, note?}`。字で書く部品は `{text: true, example}`、子の `<a href>` で書く部品は `{links: true, example}`。json の属性は `static props` の `shape`）。実行系は段階を数える前に確かめ、違うとき・`mount` や `render` が例外を出したときは部品を描かず、その場に札（`.m-error`）で何が違うかを出し、部品の段階は属性 `steps`（なければ 0）にし、知らせを `DECK.componentErrors` に積む（品質チェック（コマンド版・ブラウザ版）が読む。スタックは載せない）。指示の部品の一覧に形と見本が出る
- 置き場所：`components/<名前>/{index.js, demo.html, README.md}`。README の先頭（frontmatter）に `name` `series` `summary` `steps` `props` を書く。部品庫の部品は別のリポジトリ [egatari/components](https://github.com/egatari/components) にある（提案はその Issue へ）。Studio はそのリリースの写しを `vendor/components/<名前>/<版>/` に持ち、部品ごとの既定の版を `components.lock.json` で固定する（リリースの取り込みは `npm run components:update -- vX.Y.Z`。取り込んだ版はすべて残す）。デッキ専用の部品は `<デッキ>/components/<名前>/` に置き、先に探される
- 版：組み立ては部品庫の部品ごとに、デッキに固定した版（1 ファイルを組み直すときは、ファイルが記録した SHA-256 に `index.js` が合う版。作業フォルダでは `egatari.json` の `components`（`{<名前>: <版>}`、format spec §3.3。1 ファイルの中の写しには書き出しが使った版を書き（作業フォルダの `egatari.json` は変えない）、それがないファイルは展開が記録の版を書く）を使い、なければ `components.lock.json` の既定の版を使う。部品庫が取り下げた版は `components.lock.json` の `yanked`（`{<版>: {replacement, reason, date}}`。最新のリリースの `manifest.json` から取り込む。format spec §6）に載る。取り下げた版を固定した・記録したデッキは、その版のままで組み、警告 `yanked: m-<名前> <版> …` を出す（`kit/check.mjs` も同じ。編集アプリは知らせと組み直しのボタン）。置き換えの版に黙って替えることはしない。1 ファイルは `{name, version, sha256}` を記録し、`version` は部品庫のリリースの版、`sha256` は `index.js` の同一性の hash（改行をそろえてから hash する：CRLF と単独の CR を LF に、先頭の UTF-8 の BOM を除く。format spec §6。どの OS の checkout でも同じ hash）。このきまりの前に Windows の checkout で書き出したファイル（CRLF のバイトの hash）も、版を引ける（固定の `crlfSha256`）。動きの素（印 §7・モーフ §8・カメラ）は Studio の実行系にあり、部品ではない

## 4. 口述原稿（narration.md）

```markdown
## 更新の式 {#s-k3f9q2}           ← スライドの見出しと、スライドの id
[0] 更新の式です。今の点から、次の点を決めます。
[1] 次の点は、今の点から勾配に比例した分だけ引いて作ります。
[2] Expert: η は学習率で、1 歩の大きさを決めます。
    Novice: 大きすぎると、どうなりますか。
[concl] つまり、勾配の逆向きに、学習率に比例した幅だけ進みます。
```

- `[k]` は段階の番号、`[concl]` は結論の行の段階。1 つの段階に複数の行（話者の交代）を書ける
- 話者は `Expert:` と `Novice:` だけ。話者のない行は Expert（1 人モード）
- `{cue}` で段階の中の同期点を入れる（部品の `cues(k)` と順に対応する）
- `{mark:ID}` `{mark:ID|効果|hold=秒}` `{mark:clear}` で注目の演出を入れる（§7）。表示の文字列からは消え、TTS では `{cue}` と同じく区切りになる
- 段階の区切り（`{cue}` と `{mark:…}`）はターンをまたいで順に並べたもの（`bounds`）が、TTS の `cues`（区切りの時刻の配列）と 1 対 1 に対応する。部品の伸縮は `{cue}` の分だけを使う
- `{φ|ファイ}` はその場の読み（表示は φ、TTS は「ファイ」）。それ以外の記号は読み辞書で読む
- 式全体は読まない（品質チェックが警告する）
- `✎ ` で始まる行は、編集アプリが新しいスライドに入れた仮の文（Studio の決まりで、ファイルの形式には入らない）。ふつうの口述の文なので、残すと読み上げられる。品質チェックが警告し（`narrPlaceholder`。スライドに残った雛形の文は `templateText`）、編集アプリは音声を作る前と書き出す前に知らせる
- 段階の中の拡張の行 `@x-<名前>-<欄> <値>`（`<名前>` に `-` は入らない）は、その段階の拡張のデータ。どの発言にも入らない：表示も読み上げもされず、`bounds` にもどの hash にも入らないので、直しても音声は古くならない。開発サーバー・編集アプリ・`npm run ids` はそのまま残す

**スライドの鍵**（[形式の仕様](https://github.com/egatari/egatari-spec) §8.1）。どのスライドにも変わらない id を付ける：`<section class="slide" id="s-k3f9q2">`。id は `^[A-Za-z][A-Za-z0-9_-]{0,63}$` に合うもので、注目の演出の目印（`id="…"`・`\htmlId{…}`）と同じ文書の id の名前空間にあるので、`deck.html` のほかのどの id とも重ねない。新しい id は `s-` と base32 の 6 字（`[a-z2-7]`、乱数）で、見出しから作らない（見出しを直しても何も変わらないように）。`npm run new` はどのスライドにも id を付ける。今あるデッキには `npm run ids -- <デッキ>` で付ける。

- `deck.html` では、スライドの鍵（`data-key`、build が付ける）は section の `id`。id のないスライド（旧い書き方）は、最初の見出しを**正規化**した文字列（タグを除き、`&nbsp;` を空白とみなし、空白を**すべて**除いたもの）
- `narration.md` では、スライドを `## <見出し> {#<id>}`（勧める書き方）、`## <id>`、`## <見出し>`（旧い書き方。id のないスライドだけ）で指す。`{#id}` があれば見出しの文字列より強い。見出しの文字列がスライドの見出しと違っても、品質チェックは指摘するだけ（情報）
- id のあるスライドとないスライドを混ぜてよい。スライドごとに鍵を決める
- 鍵が同じスライドが 2 枚あるデッキは正しくない（品質チェックのエラー）。どちらかに id を付ける
- 段階の鍵は `<スライドの鍵>:<段階>` で、**最後の** `:` で分ける（スライドの鍵に `:` があってもよい）。段階は 0〜999 の 10 進（先頭の 0 なし）か `concl`。`[01]` や `[1000]` は段階にならない（build は警告し、品質チェックはエラーにする）

## 5. タイムライン

各段階の長さは実行系の `DECK.timeline()` が決める（自動再生と動画の書き出しが同じ関数を使う）。

```
dur = override.dur
   ?? max(anim, audio ? lead + audio + pad_after : hold)
```

- anim：その段階の動きの長さ（組み込みの効果と部品の `duration(k)` の最大）。段階 0 はスライドの切り替え（0.35 s）、前のスライドからのモーフ（§8）なら 0.9 s を含む
- audio：TTS の長さ（`audio/manifest.json`）。既定 lead = 0.25 s、pad_after = 0.6 s、音声のない段階の hold = 1.2 s
- `startOffset`（符号化の遅れの秒数。編集アプリの MP3 なら 0.025057。format spec §5.2）のある音声は、そのメディアの時刻から鳴らし、そこを `dur` と区切りの時刻の 0 とする（自動再生も `render/render.mjs` も）
- どの組み立ても、その段階の音声の `kind`（`tts`・`recorded`・`imported`。format spec §5.2）を `deck-audio` の項目に書く：ふつうの build、開発サーバーとプレビュー、1 ファイル、再生専用の派生（索引を外すので、再生器は `deck-audio` に頼る）。`kind` のない manifest の記録は、`engine` があれば（`tts/synth.py` の記録）`tts` とみなす。無音の `dry-run` のエンジンには `kind` を付けない。再生器はまず `deck-audio` の `kind` を読み、なければ古い 1 ファイルの索引の音声の記録を読む（確かめられるブラウザでは索引の hash を確かめてから。`DECK.audioKind(key)`）。format spec §7.3 のとおり、音声の作り方は情報の欄と再生の操作の近くで示し、舞台と字幕には出さない：どこかの段階の音声が TTS なら、操作の帯に小さな札「AI 音声」/ "AI voice"（帯と一緒に出て、一緒に隠れる。説明と `aria-label` は「音声は AI で合成したものです」/ "The narration audio is AI-generated"）、キーの一覧（<kbd>?</kbd>）に同じ文を 1 行、その段階の発表者ビューにも 1 行。`imported` の音声は、キーの一覧と発表者ビューに「音声の作り方は記録されていません」/ "How the audio was made is not recorded"（札は出さない。`DECK.aiVoice(key)`・`DECK.unknownVoice(key)`・`DECK.voiceNote(key)`・`DECK.VOICE_NOTE`）。録音には印を付けない
- 調整は `timeline.json` に例外だけを書く：`{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`
- 部品の `cues(k)` と音声の cue 時刻（`{cue}` の区切りの分だけ）が両方あり、数が合うとき、部品の時刻は区分線形に伸縮して音声に合わせる
- 注目の演出（§7）：音声のない段階では `hold` の代わりに `max(hold, 印の終わり + pad_after)` を使う。音声のある段階では印は音声の中に収まるので dur は変わらない。`anim` は印を含まない。印を含めた動きの終わりは `motion = max(anim, 印の終わり)`（動画の書き出しはここまでをコマで撮る）

## 6. （廃止）

canon への書き出し（Marp 形式の教材のバンドル）は 0.4.2 で外した。§7 以降への参照が変わらないよう、番号は残す。動画の書き出し（`render/render.mjs`）はそのまま：1 段階 = 1 クリップ。

## 7. 注目の演出（`{mark}`）

話し手の言葉に合わせて、スライドの一部に印を付ける。印も (i, k, t) だけで決まる（`seek` が毎回描き直す）。

```markdown
[2] {mark:eta|circle}η は学習率です。{mark:grad}勾配は、損失が最も急に増える向きです。
```
```html
<div class="big" data-step="1">\[ \theta_{t+1}=\theta_t-\htmlId{eta}{\eta}\,\htmlId{grad}{\nabla f(\theta_t)} \]</div>
```

- 書式：`{mark:ID}`、`{mark:ID|効果}`、`{mark:ID|効果|hold=秒}`、`{mark:clear}`（その時点で、その段階の印をすべて消す）
- 効果：`underline`（既定。手描きの下線を左から右へ）、`circle`（手描きの囲み）、`box`（角丸の枠）、`spot`（対象のまわり以外を背景色で薄くする）、`laser`（光の点が対象の下へ滑ってきて少し留まる）
- hold：出てから消え始めるまでの秒数。既定は段階の終わりまで（`laser` だけ 1.5 秒）。消えるときは 0.3 秒で薄れる。`spot` と `laser` は 1 つずつで、次のものが出ると前のものの位置から移る
- 目印：スライドの中の `id="ID"` か `data-mark="ID"` の要素。式の一部は KaTeX の `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}`（build はこの 2 つと `\htmlClass` だけを許す）。同じ ID を何枚かで使うなら `data-mark` にする（id は文書の中で一意に）
- 時刻：音声があり、区切りの数（`bounds` と `cues`）が合うときは `cue + lead`。音声が無い（生の発表・TTS の前）か数が合わないときは、その段階の動きの終わり（`anim`）から 0.9 秒おき（`{cue}` は数えない）
- 描き方：スライドに重ねた SVG（`svg.marks`、1280×720 の座標）に、対象の字の外形（文字の箱の和）から形を作り 0.5 秒で描く。色は `var(--emph)` と `var(--bg)`。手描きの揺れは ID と段階から決まる乱数で作る
- t = Infinity はその段階の最終状態（hold や clear で消えた印は出さない）。授業モードは常に最終状態。次の段階に進むと、前の段階の印は消える（段階ごとに独立）
- 印刷（PDF）には出さない
- 埋め込み：build が `<script id="deck-marks">` に `{"slideKey:stepKey": bounds}`（`{mark}` を含む段階だけ）を入れる。`DECK.MARKS`、品質チェック用に `DECK.marks(i, k)`（`[{id, effect, start, end, found}]`）
- 品質チェック：build は目印が原稿の文字列に無いと警告する（部品が作る要素は見えない）。品質チェックは実際の画面で目印を探し、無ければ警告、段階ごとの印の一覧を情報で出す

## 8. モーフ（`data-morph`）

前のスライドと同じ要素が、前の位置から今の位置へ滑ってくる切り替え（Keynote のマジックムーブ）。明示したスライドだけに起きる。

```html
<section class="slide" data-morph>               <!-- 前のスライドから。data-morph="鍵" ならそのスライドから入ったときだけ -->
  <p>\( \morph{th1}{\theta_{t+1}}=\morph{th0}{\theta_t}-\morph{eta}{\eta}\,\morph{g}{\nabla f(\theta_t)} \)</p>
  <ul><li data-id="gdef">\(\nabla f(\theta_t)\)：勾配</li></ul>
```

- 対応：元と先のスライドで同じ `data-id` を持つ要素。式の一部は `\morph{ID}{…}`（= `\htmlData{id=ID}{…}`、build の既定のマクロ）。`\htmlId{eta}{\morph{eta}{…}}` のように注目の演出の目印と重ねてよい。ID はスライドの中で一意にする（2 つ目以降は使わない。入れ子は外側だけが動く）
- 起きるとき：段階 0 に入る `seek(i, 0, t, from)` で、`from` が元のスライド（既定は i−1）のとき。長さ `DECK.T.morph` = 0.9 s。戻る・飛ぶ（t = Infinity）、印刷、`prefers-reduced-motion` では起きない。授業モードでも起きる
- 描き方：元のスライドを最終状態で下に描き、先のスライドの背景を透かす。対応する先の要素は、字の外形の中心が元の字の中心に重なる位置・大きさから、translate＋scale（transform-origin は左上）で今の位置へ動く。色が違えば補間する。対応する元の要素は隠す。対応のない元の部分は初めの 45% で消え、対応のない先の部分（段階 0 で見えているもの）は後の 55% で現れる
- 段階 0 で見えていない先の要素（`data-step` > 0 の中）は動かさない（後で普通に現れる）
- 位置は元の最終状態と先の段階 0 の配置を舞台の座標（1280×720）で測り、(from, i) ごとに覚える。呼び出し順によらず同じ画面になる。窓の大きさや字が変わったら測り直す
- タイムライン：`data-morph` で元が前のスライドなら、`anim(i, 0)` は 0.9 s 以上（自動再生と動画の書き出しは i−1 から入る）
- 限界：SVG の中の要素は対象外。対応する要素を囲む枠や背景（`.thm` など）は切り替えの終わりで入れ替わる。字が違う要素どうしを対応させると、大きさを合わせて伸び縮みする（同じ字どうしに使う）
- 品質チェック：元のスライドが無い、対応する `data-id` が 1 つも無い、ID の重複を警告し、対応の一覧を情報で出す。`DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`

## 9. スライドへのリンク

ふつうのリンクで、# の後ろがスライドの id なら、そのスライドへのリンクになる（[format spec §9.1A](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#91a-links-to-slides)）。スクリプトを含まないので、Core の文書に入れてよい。

```html
<a href="#s-njd4kp">春暁</a>            <!-- id が s-njd4kp のスライドの段階 0 -->
<a href="#s-njd4kp:2">読む順</a>        <!-- 段階 2。段階の鍵は 0・1・… か concl -->
<a href="lesson2.ega.html">次の課</a>    <!-- ほかのファイル：授業の外へ出るリンク（下の節） -->
```

- 書き方：`#<スライドの id>` か `#<スライドの id>:<段階の鍵>`。**最後の** `:` で切る。段階の鍵は 0 から始まる 10 進（`0`・`1`・…、999 まで、先頭に 0 を付けない）か `concl` で、結論の段階は `concl` でだけ指す。どのスライドの id にも合わなければスライドの鍵と比べる（id のない旧来のデッキ。品質チェックはそのリンクを警告する）。数字だけの `#N` はこれまでどおりスライドの番号（1 から）
- 開いたときの位置：ファイルの URL の同じ書き方の # が、開いたときの位置（その段階の最終状態）になる。読めない # は 1 枚目で開き、コンソールに警告を出す。最後のスライドを超える `#N` は最後のスライドで開く。送っている間のアドレスはこれまでどおり `#N`
- リンクを押すと：発表と授業モードでは、その段階の最終状態（t = ∞）へ行き、止まったまま。自動再生中はそこへ飛んで、その段階の初めから再生を続ける。動画のモードではリンクは何もしない（画面は (i, k, t) だけで決まる）。ペンやレーザーを使っている間のクリックは描くほうに使い、リンクをたどらない
- 戻る：リンクを押す前の位置を積んでおき（積み重ね）、**戻る** で直前のリンクの前の位置へ戻る（再生の状態は保つ）。左上の小さなボタン（リンクで来たときだけ出て、戻り先のスライドの見出しを書く）、Backspace（ペンを使っていないとき）、Alt+←、ブラウザの戻る。上の窓（top-level）ではリンク 1 回につき履歴を 1 つ積む（`pushState`）ので、ブラウザの戻ると進むも使える。進むでは、そのリンクの先で最後にいた位置へ戻る。ふつうの送り（矢印・番号・一覧）では履歴を積まない。iframe の中では積み重ねを覚えておくだけ
- 上の窓は動かさない：スライドへのリンクで窓を移動させない。クリックは文書の中で受けて止める（`preventDefault`）。ほかのファイル・サイトへのリンクは授業の外へ出るリンクで、窓の中の移動にはしない（下の「授業の外へ出るリンク」）
- キーボード：フォーカスのあるリンクは Enter でたどる。キーボードで押したリンクなら、戻るとそのリンクにフォーカスを戻す
- 埋め込み（`?embed=1`、iframe の中）：段階が変わるたびに親へ `{egatari:"position", slideKey, stepKey, t, cause}` を送る（`cause`：`link`・`seek`・`control`・`play`。最終状態で見せた段階の `t` は `null`）。動き方を制限する親は、`?links=0` か命令 `{egatari:"links", id?, follow:false}` でリンクを止める（答えは `{egatari:"links", id, follow}`。`window.parent` からの知らせだけを聞く）。止めたリンクでは動かず、`{egatari:"linkRefused", slideKey, stepKey}` を送る（親が自分で seek してもよい）。内部の知らせ `deck-pos`（発表者ビュー・編集アプリ）にも `cause` と `back`（戻り先のスライドの見出し、なければ `null`）を付ける
- 発表者ビュー：ほかの送りと同じく本体についてくる。自分の「戻る」ボタンを出し、Backspace・Alt+← を本体に渡す。「今の画面」の iframe で押したリンクは本体がたどる
- 字幕と読み上げの領域は、ほかの送りと同じく行き先の段階についてくる
- 実行時の API：`DECK.resolveFragment(f)` → `{i, k, key, id}` か `{error}`、`DECK.fragment(i, k)`、`DECK.follow(f)`、`DECK.back()`、`DECK.links()` → `{depth, follow, back}`、`DECK.visited(i | key)`（このセッションでそのスライドを見せたか。`m-menu` が使う）
- 品質チェック：行き先のスライドがない・段階が範囲の外・結論のないスライドへの `concl`・最後のスライドを超える番号のリンクは**エラー**。`#N` のリンク、id のないスライドへのリンク、ない相手のファイルへの相対リンクは警告

### 授業の外へ出るリンク

形式の仕様 §11：授業の中でない行き先へのリンクは偽装に使われうるので、再生器は出る前に行き先を見せる。決まりは純ロジックの `kit/core/link-policy.mjs`（`LinkPolicy().decide(link, {base, hosts})`。DOM も `node:` も使わない）で、実行系（`DECK.LinkPolicy`）・試験・将来の再生ページが共有する。

- この文書の中を指さないリンクのクリック（左・修飾キー付き・中ボタン・フォーカスして Enter）はすべて止め、窓は移らない。確認の箱（`#deck-extlink`、`role="alertdialog"`、`aria-modal`）に行き先の host と全体のアドレスを見せ、**開く**を押したときだけ、新しい閲覧文脈（`noopener,noreferrer`）で開く。焦点は**やめる**から始まり、Tab は箱の中で回り、Esc か箱の外を押すとやめてリンクに焦点を戻す。後ろの授業は `inert` で、箱の中のキー・ポインターでスライドは動かない
- 同意済みでも毎回確かめる（箱に理由を書く）：リンクの字が行き先と別の host を名指している（`example.org` と見せて別の host へ。`www.` の違いは無視）、行き先が `https:` でない（`http:`・`mailto:`・`tel:`）、`download` がある、アドレスにユーザー名・パスワードの形がある、host が punycode（`xn--`）。ふつうの `https:` のリンクは、同じ閲覧のあいだ host ごとに 1 度だけ聞く（記憶はメモリだけ）
- 開かない（**開く**のない箱）：`http`・`https`・`mailto`・`tel` 以外の scheme（`javascript:`・`data:`・`file:`・`blob:`・`vbscript:`・`ftp:` …）と、読めないアドレス。例外は、`file:` で開いた授業の、隣のファイルへの相対リンクで、毎回確かめる
- 動画・発表者ビューの中の画面：何も起こさない。印刷：箱は隠す。編集のプレビュー・開発サーバーの枠（sandbox、ポップアップなし）：箱は行き先を知らせるだけで**開く**がない。たどるときは、書き出したデッキか 1 ファイルで
- 再生器が自分で作るリンク（ライブの「ブラウザで参加する」・添付の保存）は授業の内容ではないので、確認の箱を通さない（形式の仕様 §11 (h)）。再生器が JavaScript の性質 `__egaOwn` で印を付け、授業の HTML からは付けられない（`data-ega-own` などの属性は効かない。`tools/test-extlinks.mjs` が確かめる）。ライブの板には、リンクの隣に参加先の host を出す
- 実行時の口：`DECK.LinkPolicy()`、`DECK.extLink(href, text?, download?)`

## 10. 品質チェック：わざと切る

`data-clip` は書き方の決まりで、ファイル形式の属性ではない。この節がその決まりの本文。Studio では名前を 1 か所（`kit/core/layout-scan.mjs` の `CLIP_ATTR`）にだけ置く。

```html
<div class="code wall" data-clip>…箱でわざと切る長い XML…</div>
```

- 品質チェック（コマンド版・ブラウザ版。`kit/core/layout-scan.mjs` の 1 つの実装）は、`overflow` が `visible` でない箱で切れる字（`textClipped`）、SVG の枠（viewBox）で切れるかスライドの外に出る SVG の字（`svgTextOut`）、まわりに描いた `<rect>` からはみ出す SVG の字（`svgTextBox`）、`.body` の外に置いてスライドの外に出るか見出し・結論の行・ページ番号に重なる字（`outsideBody`）を警告しなければならない。どのスライドでも、`.body` のないスライドでスライドの外に出る字（`textOffSlide`）、ほかの字の箱やスライドの帯（飾り）に重なる字の箱（`textOverlap`）、表のセルで途中で折り返す短い語（`cellWordBreak`）も警告しなければならない。どれも R-fit の警告
- 要素に `data-clip` を付けると、そこで切るのはわざとだと示す：その要素の中の字（子孫もすべて、SVG の字も）を、これらの検査で知らせてはならない。縦横どちらの向きにも効く。ほかの検査（`bodyBottom`・`smallText` など）も表示も変えてはならない
- 本文が下にはみ出すスライド（`bodyBottom`）では、`.body` の中の字がスライドの外に出ることを重ねて知らせない（スライドの端の `svgTextOut`）。本文を減らせばどちらも直る
- 書き手は `data-clip` を、切ること自体が伝えたいことであるところ（下を薄くしたコードの「壁」など）にだけ使い、はみ出しを隠すためには使わない

`data-annot` も同じ種類の書き方の決まり（Studio では `kit/core/layout-scan.mjs` の `ANNOT_ATTR`）で、**わざと小さくした注記**を示す。

```html
<span class="kb-num" data-annot>10</span>
```

- 要素に `data-annot` を付けると、その中の字は、説明する字の脇に添える注記（`m-kanbun` の返り点・読む順の番号など）だと示す：その要素の中の字（子孫もすべて、SVG の字も）を、字が小さい（`smallText`・`smallSvgText`。R-fit の 24px・27px の最小）として知らせてはならない。ほかの検査（`textClipped`・`bodyBottom` など）も表示も変えてはならない
- `data-annot` が効くのは、部品が mount で作った要素だけで、書き手が書いたものには効かない：プレーヤーは、部品が mount する前に、デッキ自身の記述にある `data-annot`（`m-*` の中に手で書いた子も）をすべて外すので、印を付けて小さい字を逃れることはできない。部品は mount の中で付ける
- 部品は `data-annot` は、字の中を指す短い印（数字や数文字）にだけ使い、内容には使わない：文・図の札・表のセルは注記ではない。最小を守れるところは守り、この印は最後の手段にする

## 11. 授業の部屋の板（拡張 live。下書き）

授業の部屋を付けて書き出した再生専用の写しにだけ、部屋の再生器（`kit/live.js` と `kit/core/live-policy.mjs`。`kit/core/live.mjs` が入れる）が入る。ほかの出力は変わらない。ふるまいの正本は形式の[拡張 `live`](https://github.com/egatari/egatari-spec/blob/main/extensions/live.md)、通信は [egatari/live](https://github.com/egatari/live)。ここに書くのは Studio の実行系の約束。

- 板は初めたたんでいる：出すのは印 `#live-mark`（`aria-expanded` を持つ `<button>`。右上）だけで、`#stage` は窓いっぱい（`fit()` の置き方のまま）。印は、つながりの状態（`data-state`・色の点・読み上げ用の字）を見せる。板は、印を押すと開き（たたむまで開いたまま）、投票（`*` でないもの）のある段階では、窓の中で、つなげるか「ブラウザで参加する」を出せる文書なら自分で開く。その段階を離れると、学ぶ人が **開いたままにする** を押していなければたたむ。開いたことは板の外の polite な live region で知らせ、フォーカスは動かさない
- 開いた板は舞台の外：`#live-pane` は右（縦長の窓では下）に置き、`#stage` は残りの場所に `fit()` と同じ式で収める。`DECK.seek(i, k, t)` の描くもの・字幕・印・印刷を変えてはならない。動画（`?mode=video`）・発表者ビューとその中の画面（`?presenter`・`?view`）では板を作らず、印刷では（印も）隠す
- `deck:pos`（`detail.key`）は、どの投票を出すか・板を開くかを決めるためだけに聞く。位置や時間は送らない。時計（つなぎ直し・つながりを保つ ping・窓の終わり）を使うが、舞台に何も描かないので許される
- endpoint は `https:` でなければならない。ループバックの `http:` を許すのは、試験が `buildPortable(…, {liveDevLoopback: true})`（コマンドの引数にはしない）で組む開発版の再生器だけ。切り替えは `kit/core/live-policy.mjs` の定数で、その組み立てだけが入れる。配る教材の再生器・編集アプリの書き出し・`kit/build.mjs --live` は `http:` を断る
- つなぐのは「参加する」の後、窓の中（2 分のゆとり）で、枠の中でない `file:`・`http(s):` の文書のうち、CSP の `<meta>` がちょうど 1 つでその `connect-src` が endpoint と同じものだけ。ほか（枠・`srcdoc`・sandbox やプレビューの文書）では部屋の場所を字で見せる

## 12. テーマと体裁の CSS

テーマ（`tokens.css`）は、どの組み立ての口でも、`kit/base.css` と `kit/layouts.css` の後（`kit/latin.css` の前）に読む。なので、テーマは変数だけでなく体裁の規則も上書きできる：表紙・章の扉・見出し・`.body` の余白・結論の行・ページ番号・箇条書きの印・進み具合の帯。`html` を前に付けるなどして詳細度で勝たなくてよい。

- テーマが何を替えても、色の変数の意味は変わらない：`--emph` は結論・問題、`--term` は用語・補足、`--muted` は既知の結果、`--fg` は地の文字、`--line` は飾りだけ。部品はこれらの変数だけを使い（§3）、品質チェックの色の決まり（`--bg` とのコントラスト）はどのテーマにも効く
- 体裁の箱を動かすテーマにも品質チェックは効く。描いた結果を測るが、既定の位置を前提にする検査（結論の行の 571px など）もあるので、テーマが寸法を宣言できるようになるまで（backlog #76）、動かしたテーマには指摘が出ることがある
- 同梱のテーマは変数だけを決めるので、この順で見た目は変わらない
