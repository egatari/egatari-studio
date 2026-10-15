# 約束事（実行系・部品・口述原稿・タイムライン）

このリポジトリのすべての部品は、この文書の約束に従う。変えるときはこの文書を先に直す。
選択肢・記法・キーの一覧は [reference.ja.md](reference.ja.md)（[English](reference.md)）。

## 1. 位置と時刻

発表中の「位置」は (スライド i, 段階 k, 段階の開始からの秒数 t) の 3 つで決まる。

- 段階 0 はスライドに入った直後。`data-step="k"` の要素は段階 k で現れる。結論の行（`.concl`）は自動で最後の段階になる
- **画面は (i, k, t) だけで決まる**。実時間の時計、`setTimeout`、`requestAnimationFrame`、シードのない乱数を部品の中で使ってはいけない
- t = Infinity はその段階の最終状態（戻る・ページ指定・印刷・動画の静止区間）
- 実行系は 1 か所（`DECK.seek(i, k, t)`）で画面を描く。手動の発表では実時間を、動画の書き出しでは仮想の時刻を渡す

- 段階 0 でスライドが切り替わる途中（`seek(i, 0, t, from)`）は、前のスライド `from` を最終状態で下に描く。`data-morph` のスライドに元のスライドから入るときは、重ねて薄れる代わりにモーフになる（§8）
- 画面を撮る側（動画の書き出し・検査）は、`seek` の後に `requestAnimationFrame` を 2 回待ってから撮る（描画が反映される前の画面を撮らないため）
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
- `render` は**同じ (k, t) なら必ず同じ画面**にする。前回の呼び出しの状態に頼らない（戻る・飛ぶ・動画の書き出しで順番が変わるため）
- `ctx = {mode, slide, instant, deck}`。`ctx.mode === "lecture"` のときは最終状態を見せて今の段階を強調する、などを部品が選べる
- **色はテーマの CSS 変数だけ**を使う：`var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`。SVG では属性ではなく `style="stroke:var(--emph)"` で書く（`DECK.el` は `fill` `stroke` に `var(` があれば自動で style に回す）
- 数値データは検算済みのスクリプトの出力だけを使う。`<script type="application/json">{{JSON:file.json}}</script>` を部品の子に置くと `this.data` で読める
- 置き場所：`components/<名前>/{index.js, demo.html, README.md}`。README の先頭（frontmatter）に `name` `summary` `steps` `props` を書く

## 4. 口述原稿（narration.md）

```markdown
## 更新の式                       ← スライドの見出しの文字列（または section の id）
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
- 式全体は読まない（検査器が警告する）
- 見出しが重なるスライドは `<section id="…">` を付け、`## …` に id を書く

スライドの鍵（`data-key`）は、section の id、なければ見出しの文字列（タグを除き、空白を詰めたもの）。build が付ける。

## 5. タイムライン

各段階の長さは実行系の `DECK.timeline()` が決める（自動再生と動画の書き出しが同じ関数を使う）。

```
dur = override.dur
   ?? max(anim, audio ? lead + audio + pad_after : hold)
```

- anim：その段階の動きの長さ（組み込みの効果と部品の `duration(k)` の最大）。段階 0 はスライドの切り替え（0.35 s）、前のスライドからのモーフ（§8）なら 0.9 s を含む
- audio：TTS の長さ（`audio/manifest.json`）。既定 lead = 0.25 s、pad_after = 0.6 s、音声のない段階の hold = 1.2 s
- 調整は `timeline.json` に例外だけを書く：`{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`
- 部品の `cues(k)` と音声の cue 時刻（`{cue}` の区切りの分だけ）が両方あり、数が合うとき、部品の時刻は区分線形に伸縮して音声に合わせる
- 注目の演出（§7）：音声のない段階では `hold` の代わりに `max(hold, 印の終わり + pad_after)` を使う。音声のある段階では印は音声の中に収まるので dur は変わらない。`anim` は印を含まない。印を含めた動きの終わりは `motion = max(anim, 印の終わり)`（動画の書き出しはここまでをコマで撮る）

## 6. canon への出力

1 段階 = 1 コマ = 1 チャプター。`clip_NNNN.mp4`（80MB 以下）、`clip_NNNN.png`（最終状態）、Marp 形式の md（各ページに `# 見出し`、2 段階目からは `<!-- _paginate: hold -->`、口述原稿コメントに `Expert:` / `Novice:` の行）。

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
- 埋め込み：build が `<script id="deck-marks">` に `{"slideKey:stepKey": bounds}`（`{mark}` を含む段階だけ）を入れる。`DECK.MARKS`、検査用に `DECK.marks(i, k)`（`[{id, effect, start, end, found}]`）
- 検査：build は目印が原稿の文字列に無いと警告する（部品が作る要素は見えない）。check は実際の画面で目印を探し、無ければ警告、段階ごとの印の一覧を情報で出す

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
- 検査：check は元のスライドが無い、対応する `data-id` が 1 つも無い、ID の重複を警告し、対応の一覧を情報で出す。`DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`
