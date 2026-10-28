<!-- i18n: pair=contract.md sha256=93f7830890b7025a -->
# 約束事（作るときの記法についての Studio の注）

[English](contract.md) | 日本語

**規範の文は形式の仕様で、このページではない。**作るときの記法（スライド・ステップ・スライドの種類・時間の定数・数式・ファイルの参照・スライドの識別子・台本・読み・パーツの約束・強調・モーフ）は [Egatari の形式の仕様 §8](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#8-authoring-source-contract-version-1) が決める。タイムラインは §5.5、スライドへのリンクは §9.1A。表示のモード・先のステップを薄く見せる選び・授業の外へ出るリンクは [Egatari Player 1.0](https://github.com/egatari/egatari-spec/blob/main/egatari-player-1.0.md)（P1・P4）。このページには、Egatari Studio が足すものだけを書く：実装の置き場所、実行時の API、開発サーバー、`✎` の仮の行、品質チェックの指摘の名前、Studio 自身の CSS の手がかり。食い違うときは仕様が正しい。変えるときは仕様を先に直す。

選択肢・記法・キーの 1 行ずつの一覧は [reference.ja.md](reference.ja.md)（[English](reference.md)）。下の節の番号は、ほかからの参照が切れないように残している。

| 項目 | 規範の文 |
|---|---|
| 位置 *(i, k, t)*・ステップ・スライドの種類・時間の定数・数式・原稿の中の参照 | 形式 §8.0 |
| タイムライン（`dur`・`lead`・`pad_after`・`hold`・上書き） | 形式 §5.5 |
| スライドの識別子と鍵・ステップの印 | 形式 §8.1 |
| 台本（ブロック・発言・`{cue}`・`{note:…}`・拡張の行）・読み | 形式 §8.2・§8.3 |
| パーツ（`ctx`・ステップ・先を薄く見せる・見せ方・見る人の入力・音・テーマの色） | 形式 §8.4 |
| 強調（`{mark}`） | 形式 §8.5 |
| モーフ（`data-morph`） | 形式 §8.6 |
| 表示のモード・先のステップを薄く見せる | Player P1 |
| スライドへのリンク・授業の外へ出るリンク | 形式 §9.1A、Player P4・P4.2 |
| ライブ | 拡張 `live`（形式の `extensions/live.md`） |

## 1. 位置と時刻

- Studio の実行系は画面を 1 か所で描く：`DECK.seek(i, k, t)`（`t = Infinity` はそのステップの最終状態）。発表では実時間を、動画の書き出しでは仮の時間を渡す。**パーツは実時間の時計、`setTimeout`、`requestAnimationFrame`、シードのない乱数を使ってはいけない**
- ステップ 0 でスライドが切り替わっている間（`seek(i, 0, t, from)`）は、前のスライド `from` を最終状態で下に描く。元のスライドから入った `data-morph` のスライドは、代わりにモーフで動く（§8）
- 画面を撮るもの（動画の書き出し・品質チェック）は、`seek` の後に `requestAnimationFrame` を 2 回待ってから撮る
- テーマの色は `oklch()` と `color-mix()` で書くので、`getComputedStyle` の値が rgb とは限らない。数が要るときは canvas に塗って読み戻す

## 2. 表示モード

モードと「先のステップを薄く見せる」は Player P1。Studio の実行系では：`?mode=talk|video`（既定は `talk`。または `<html data-mode>`）。`learn` はまだない。**先のステップを薄く見せる**は選び `?preview=1`（キー `l`）で、テーマの `--preview-opacity` で薄くする。`data-preview="none"` の要素と、`preview: "none"` を宣言したパーツは先を見せない（形式 §8.4）。

## 3. パーツ（Web Components）

パーツの約束は形式 §8.4。Studio の実行時の API での書き方：

```js
DECK.define("m-sweep", class extends DECK.MotionElement {
  static steps = 2;                         // ステップの数（steps 属性で上書きできる）
  static props = {                          // 受け取る値の宣言（パーツの一覧を作るのに使う）
    from: {type: "number", default: 0, doc: "始めの値"},
  };
  mount(ctx)       { /* 1 回だけ。SVG と要素を作る */ }
  duration(k)      { return 1.2; }          // ステップ k の動きの長さ（秒）
  cues(k)          { return null; }         // ステップ k の中の同期点：そのステップの台本の {cue} 1 つに 1 つ（頭の 0 は書かない）
  render(k, t, ctx){ /* ステップ k が始まって t 秒の状態。t = Infinity は最終状態 */ }
});
```

- `ctx` は形式 §8.4 に挙げたものだけ。ほかに頼らない（Studio の実行系は内部のもの `ctx.deck` も渡すが、約束の一部ではなく、1.x のパーツにだけ渡す）
- **パーツライブラリ 2.0（試し。教材ごとに選ぶ）。** 作業フォルダの `egatari.json` に `"componentsCatalogue": "2"`（または `"2.0.0-rc.1"` のようなカタログの版。組み立ての `--components-catalogue`）がある教材は、egatari/components 2.x のパーツで組む（`vendor/components-2/<名前>/<版>/`、`components2.lock.json` で固定、`node tools/components2-update.mjs v2.Y.Z` で取り込む）。組み立ては登録簿 `egatariParts`（`kit/parts-registry.js`、形式 §6.1）を書き、使う要素が要るパーツを依存の順に、ちょうどの版で書く。教材の中のパーツ（`<デッキ>/components/<名前>/index.js`）は、`egatariParts.define` を書いていれば埋め込みの 2.0 のパーツ、`DECK.define` なら 1.x のパーツのまま。パーツの meta は（埋め込みでも写しでも）字で読み、動かさない：`define` の最初の引数に、決まった形の object の字で書く（鍵は名前か "…"、値は "…" か同じ形の object。注釈・式・展開・末尾の , は書かない）。そうでないパーツは書かずに知らせる。1 つのファイルで要素の名前は 1 つ：同じ要素の名前の定義が 2 つ要る（1 つのパーツの 2 つの版でも、名前の違うパーツでも）ときは、組み立ては断ってぶつかりを知らせる（作り手がパーツを直す）。登録簿の `status()` は `{defined, failed: [{name, version, element?, reason}]}`（`meta`・`factory`・`missing`・`dependency`・`duplicate`・`element`）。実行系は失敗したパーツの要素を字の代わりにする。パーツが `build.fields` に宣言した欄は組み立てのときに決まった名前で描き（今は KaTeX の `<欄>Html`。abcjs の `<欄>Svg`・`<欄>Map` はまだ）、`build.subset` の塊は教材の字（原稿の全部の字（属性の値も）・口述原稿・パーツに渡すデータ・パーツの `glyphs`）だけを、宣言ごとに宣言した順に残す（形式 §6.2）。2.0 のパーツには `deck` のない `ctx` を渡し、実行系は `layout(ctx)` を呼び（窓の大きさが変わるたび・字が読み込まれた・スライドが見えた・隠れていた文書が見えた）、パーツの知らせを `DECK.componentReports` に残す（`error`・`data`・`attr` は `DECK.componentErrors` にも）。`componentsCatalogue` がなければ何も変わらない
- 見ている人のものでない描画（印刷・スライド一覧・品質チェック・動画のコマ）はスライドに入ったことにしない：`ctx.entered` は `false` のまま、見ている位置に戻るときも見る人の入力を消さない。別の位置を描いて戻る道具は、`DECK.seek` を `DECK.aside(fn)` の中で呼ぶ
- 手で動かした状態：パーツの中で `pointerdown`・`keydown`・`wheel`・`input`・`change` が起きると、実行系はそのパーツに触れた印を付け、次にステップに入るとき（どの `DECK.seek` や `DECK.go` も、リンク、発表者ビューの指示、印刷）、まず別のステップ（t = Infinity）で描いてから (k, t) を `ctx.reset = true` で描く。触れていないパーツは 1 回だけ描く
- **色はテーマの CSS 変数だけ**を使う：`var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`。SVG では属性ではなく `style="stroke:var(--emph)"` で書く（`DECK.el` は `fill` `stroke` に `var(` があれば自動で style に回す）
- データ：検算したスクリプトが出した数だけを使う。パーツの子に `<script type="application/json">{{JSON:file.json}}</script>` を置き、`this.data` で読む（直下の子にちょうど 1 つ。2 つ以上なら `this.data` は `null` で、スライドは独自のコードを持つものとして扱う）
- データの形は `static shape` で宣言する（`kit/shape.js`：JSON Schema の小さな部分集合 `{schema, example, note?}`。文で書くパーツは `{text: true, example}`、子の `<a href>` は `{links: true, example}`。json の属性は `static props` に `shape` を持てる）。実行系はステップを数える前に確かめる：合わないとき、または `mount`・`render` が例外を投げたときは描かず、その場に何が悪いかを書いた代わり（`.m-error`）を出し、ステップの数は `steps` 属性（なければ 0）、問題は `DECK.componentErrors` へ（品質チェックがコマンドでもブラウザでも読む。スタックは出さない）。指示のパーツの一覧に形と例が出る
- 置き場所：`components/<名前>/{index.js, demo.html, README.md}`。README の先頭（frontmatter）に `name` `series` `summary` `steps` `props` を書く。パーツライブラリのパーツは別のリポジトリ [egatari/components](https://github.com/egatari/components) にある（提案はその Issue へ）。Studio はそのリリースの写しを `vendor/components/<名前>/<版>/` に持ち、パーツごとの既定の版を `components.lock.json` で固定する（リリースの取り込みは `npm run components:update -- vX.Y.Z`。取り込んだ版はすべて残す）。教材専用のパーツは `<教材>/components/<名前>/` に置き、先に探される
- 版：組み立てはパーツライブラリのパーツごとに、教材に固定した版（Egatari ファイルを組み直すときは、ファイルが記録した SHA-256 に `index.js` が合う版。作業フォルダでは `egatari.json` の `components`（`{<名前>: <版>}`、format spec §3.3。Egatari ファイルの中の写しにはエクスポートが使った版を書き（作業フォルダの `egatari.json` は変えない）、それがないファイルは展開が記録の版を書く）を使い、なければ `components.lock.json` の既定の版を使う。パーツライブラリが取り下げた版は `components.lock.json` の `yanked`（`{<版>: {replacement, reason, date}}`。最新のリリースの `manifest.json` から取り込む。format spec §6）に載る。取り下げた版を固定した・記録した教材は、その版のままで組み、警告 `yanked: m-<名前> <版> …` を出す（`kit/check.mjs` も同じ。編集アプリは知らせと組み直しのボタン）。置き換えの版に黙って替えることはしない。Egatari ファイルは `{name, version, sha256}` を記録し、`version` はパーツライブラリのリリースの版、`sha256` は `index.js` の同一性の hash（改行をそろえてから hash する：CRLF と単独の CR を LF に、先頭の UTF-8 の BOM を除く。format spec §6。どの OS の checkout でも同じ hash）。このきまりの前に Windows の checkout で書き出したファイル（CRLF のバイトの hash）も、版を引ける（固定の `crlfSha256`）。動きの素（印 §7・モーフ §8）は Studio の実行系にあり、パーツではない

## 4. 台本（narration.md）

記法は形式 §8.1〜§8.3。Studio が足すもの：

- `npm run new` はどのスライドにも id を付ける。`npm run ids -- <deck>` は id のない教材に id を付ける（台本の見出しの `{#id}` も付け、`audio/manifest.json`・`timeline.json`・`comments.json` の鍵も付け替える）。そのような教材を開いて直せるように、Studio の組み立ては id のないスライドをまだ見出しで鍵にし、品質チェックが知らせる（`legacyIndex`・`linkNoId`）。鍵の重なりはエラーで、組めるように組み立ては後のスライドに `#2`・`#3`… を付ける
- Egatari ファイルには見出しによる鍵を書かない：エクスポートが先に id のないスライドと台本の見出しに id を付け、作業フォルダにも書き戻す（`audio/manifest.json`・`timeline.json`・`comments.json`・`egatari.json` の鍵も。控えは `.cache/edits/`）
- 組み立ては発言ごとに `{role, text, ttsParts}` を `deck-narration`（`DECK.NARRATION`）に書く：`ttsParts`（`kit/core/narration-core.mjs` の `renderText`。`inputHash` に入るのと同じ値）は表示せず、字の絞り込みにも入れない。読み上げで聞く（§5）がこれを読む
- `✎ ` で始まる行は、編集アプリが新しいスライドに置いた仮の行（Studio の決まりで、形式の一部ではない）。ふつうの台本の文なので、残せば読み上げられる。品質チェックが警告し（`narrPlaceholder`。スライドに残ったテンプレートの字は `templateText`）、編集アプリは TTS と書き出しの前にその警告を出す
- 式をそのまま読まない（品質チェックが警告する）。拡張の行は、開発サーバー・編集アプリ・`npm run ids` がそのまま残す

## 5. タイムライン

式と定数は形式 §5.5 と §8.0。Studio では `DECK.timeline()` が計算する（自動再生も動画の書き出しも同じ関数）。`timeline.json` には例外だけを書く（`{"<スライドの鍵>:2": {"pad_after": 1.0}}`）。

- `startOffset`（エンコーダの遅れの秒。編集アプリの MP3 では 0.025057 など）のある音声は、そのメディアの時刻から鳴らし、そこを `dur` と同期点の時刻の 0 とする（自動再生も `render/render.mjs` も）
- どの組み立ても、ステップの音声の `kind` を `deck-audio` の項目に書く（再生専用の派生は索引を落とすので、プレーヤーは `deck-audio` に頼る）。`kind` のない manifest の記録は、`engine` があれば `tts` とする。音のない `dry-run` には `kind` を付けない。プレーヤーは `deck-audio` の `kind` を先に読み、前のファイルでは索引の音声の記録に戻る（`DECK.audioKind(key)`）。形式 §7.3 のとおり、音声の作り方は情報と再生の操作の近くで言い、スライドの上や字幕には出さない：どこかのステップの音声が TTS なら、ツールバーに小さな「AI 音声」/ "AI voice" の札（title と `aria-label` は「音声は AI で合成したものです」/ "The narration audio is AI-generated"）、キーの一覧（<kbd>?</kbd>）と、そのステップの発表者ビューにも同じ文。`imported` の音声には「音声の作り方は記録されていません」/ "How the audio was made is not recorded" をそこに出し、札は付けない（`DECK.aiVoice(key)`・`DECK.unknownVoice(key)`・`DECK.voiceNote(key)`・`DECK.VOICE_NOTE`）。録音には付けない
- **読み上げで聞く**（形式 §5.6）はタイムラインに入らない：音声のないステップで「読み上げで聞く（音声ファイルにはなりません）」を押すと、端末の読み上げの声（`speechSynthesis`。`localService` の声だけ）で `ttsParts` を読む（`ttsParts` のない前のファイルでは「読み方は反映されません（古いファイル）」）。`dur`・`DECK.timeline()`・`deck-audio`・描く画面を変えず、何も書かず、`?mode=video` と印刷にはない（`kit/core/read-aloud.mjs`、`DECK.ReadAloud`）
- 強調まで含めた動きの終わりは `motion = max(anim, marksEnd)`。動画の書き出しはここまでのコマを撮る

## 6. （廃止）

canon への書き出し（Marp 形式の教材の束）は 0.4.2 でなくした。§7 から後への参照が切れないように番号を残す。

## 7. 強調（`{mark}`）

記法・効果・目印・時刻は形式 §8.5。Studio では（初めの 2 つは AI への指示に引く）：

- 効果：`underline`（既定。手描きの下線を左から右へ）、`circle`（手描きの囲み）、`box`（角丸の枠）、`spot`（対象のまわり以外を背景色で薄くする）、`laser`（光の点が対象の下へ滑ってきて少し留まる）
- 目印：スライドの中の `id="ID"` か `data-mark="ID"` の要素。式の一部は KaTeX の `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}`（build はこの 2 つと `\htmlClass` だけを許す）。同じ ID を何枚かで使うなら `data-mark` にする（id は文書の中で一意に）
- 描き方：スライドに重ねた SVG（`svg.marks`、1280×720）に、目印の字の輪郭（字の箱の和）から形を作って描く。手描きの揺れは ID とステップで決まる乱数で作る。次の `spot`・`laser` は前のものの位置から動く
- 組み立ては `{"スライドの鍵:ステップの鍵": bounds}`（`{mark}` のあるステップだけ）を `<script id="deck-marks">` に入れる。`DECK.MARKS`、品質チェック用に `DECK.marks(i, k)`（`[{id, effect, start, end, found}]`）
- 品質チェック：組み立ては目印が原稿の字にないと警告する（パーツが作る要素は見えない）。品質チェックは実際の画面で目印を探し、なければ警告し、ステップごとの強調を情報として並べる

## 8. モーフ（`data-morph`）

対応のさせ方と時刻は形式 §8.6。Studio では：

- `\morph{ID}{…}` は組み立ての既定のマクロ。`\htmlId{eta}{\morph{eta}{…}}` のように強調の目印と重ねられる。元のスライドを最終状態で下に描き、対応した要素は、字の輪郭の中心が元の場所に重なる位置から translate と scale（transform-origin は左上）で動き、色は補間する。対応した要素を囲む枠や背景（`.thm` など）は終わりに入れ替わる。字の違う要素どうしを対応させると伸び縮みする。位置は (from, i) ごとに覚え、窓の大きさや字が変わると測り直す。`DECK.T.morph` = 0.9
- 品質チェック：元のスライドがない、合う `data-id` が 1 つもない、ID が重なる、を警告し、対応を情報として並べる（`DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`）

## 9. スライドへのリンク

書き方と動きは形式 §9.1A と Player P4（`#<スライドの id>` か `#<スライドの id>:<ステップの鍵>` のアンカー。数字だけの `#N` はスライドの番号）。Studio では：

- **戻る**：左上の小さなボタン（リンクで来たときだけ出て、戻る先のスライドの名前を書く）、Backspace（ペンを使っていないとき）、Alt+←、ブラウザの戻る。上の窓ではリンク 1 つごとに履歴を 1 つ足す（`pushState`）。枠の中では積み上げをメモリにだけ持つ。どのスライドの id にも合わない # はスライドの鍵と比べ（id のない教材）、品質チェックがそのリンクを警告する
- 埋め込み（`?embed=1`）の知らせは Player P8。Studio の内部の `deck-pos` の知らせ（発表者ビュー・編集アプリ）は `cause` と `back` も運ぶ。発表者ビューの窓は本体の窓についていき、Backspace・Alt+← を本体に送る
- 実行時の API：`DECK.resolveFragment(f)` → `{i, k, key, id}` か `{error}`、`DECK.fragment(i, k)`、`DECK.follow(f)`、`DECK.back()`、`DECK.links()` → `{depth, follow, back}`、`DECK.visited(i | key)`（`m-menu` が使う）
- 品質チェック：ないスライドへのリンク、範囲の外のステップ、結論の行のないスライドの `concl`、最後より後のスライドの番号は**エラー**。`#N` のリンク、id のないスライドへのリンク、ない相手のファイルへの相対リンクは警告

### 授業の外へ出るリンク

決まりは Player P4.2。Studio は純ロジックの `kit/core/link-policy.mjs`（`LinkPolicy().decide(link, {base, hosts})`。DOM も `node:` も使わない）で実装し、実行系（`DECK.LinkPolicy`）・試験・将来の再生ページが共有する。

- 確認の箱は `#deck-extlink`（`role="alertdialog"`・`aria-modal`）：行き先のホストと完全なアドレス、**開く** で `noopener,noreferrer` の新しい窓に開く。focus は **キャンセル** から、Tab は箱の中を回り、Esc か外のクリックで取り消してリンクに focus を戻す。後ろの授業は `inert`。ふつうの `https:` のリンクは、見ている間にホストごとに 1 回だけ聞く（メモリにだけ持つ）。リンクの字と行き先のホストが違う、`https:` でない、`download` がある、ユーザー名やパスワードがある、punycode のホスト、は毎回聞く。ほかの scheme は断る（`file:` で開いた授業から隣のファイルへの相対リンクは毎回聞く）
- 動画のモードと発表者ビューの中の画面では何もしない。印刷では箱を隠す。編集アプリのプレビューと開発サーバーの枠（sandbox。ポップアップなし）では、箱は行き先を伝えるだけで **開く** がない
- プレーヤーが自分で作るリンク（ライブの「ブラウザで参加する」・添付の保存）は箱を通さない：プレーヤーが JavaScript の性質 `__egaOwn` で印を付け、授業の HTML からは付けられない（`tools/test-extlinks.mjs` が確かめる）
- 実行時の API：`DECK.LinkPolicy()`、`DECK.extLink(href, text?, download?)`

## 10. 品質チェック：わざと切る

`data-clip` は書き方の決まりで、ファイル形式の属性ではない。この節がその決まりの本文。Studio では名前を 1 か所（`kit/core/layout-scan.mjs` の `CLIP_ATTR`）にだけ置く。

```html
<div class="code wall" data-clip>…箱でわざと切る長い XML…</div>
```

- 品質チェック（コマンド版・ブラウザ版。`kit/core/layout-scan.mjs` の 1 つの実装）は、`overflow` が `visible` でない箱で切れる字（`textClipped`）、SVG の枠（viewBox）で切れるかスライドの外に出る SVG の字（`svgTextOut`）、まわりに描いた `<rect>` からはみ出す SVG の字（`svgTextBox`）、`.body` の外に置いてスライドの外に出るか見出し・結論の行・ページ番号に重なる字（`outsideBody`）を警告しなければならない。どのスライドでも、`.body` のないスライドでスライドの外に出る字（`textOffSlide`）、ほかの字の箱やスライドの帯（飾り）に重なる字の箱（`textOverlap`）、表のセルで途中で折り返す短い語（`cellWordBreak`）も警告しなければならない。どれも R-fit の警告
- 要素に `data-clip` を付けると、そこで切るのはわざとだと示す：その要素の中の字（子孫もすべて、SVG の字も）を、これらの検査で知らせてはならない。縦横どちらの向きにも効く。ほかの検査（`bodyBottom`・`smallText` など）も表示も変えてはならない
- 本文が下にはみ出すスライド（`bodyBottom`）では、`.body` の中の字がスライドの外に出ることを重ねて知らせない（スライドの端の `svgTextOut`）。本文を減らせばどちらも直る
- 祖先が隠す箱は測らない：読み上げ用に見えなくした入れ物の中（`overflow` が `visible` でない 2px 以下の箱。1×1 の `.sr-only` の形）や、`clip-path: inset(…)`・`clip: rect(…)` で何も残らない祖先の中は、クラスの名前によらず、体裁のどの検査（`bodyBottom`・`bodyRight`・`smallText`・`textOverlap` など）でも知らせてはならない。本文の場所の検査は、祖先の `overflow` が見せる部分だけを測る。見える大きさの箱で切れる字は今までどおり `textClipped`
- 書き手は `data-clip` を、切ること自体が伝えたいことであるところ（下を薄くしたコードの「壁」など）にだけ使い、はみ出しを隠すためには使わない

`data-annot` も同じ種類の書き方の決まり（Studio では `kit/core/layout-scan.mjs` の `ANNOT_ATTR`）で、**わざと小さくした注記**を示す。

```html
<span class="kb-num" data-annot>10</span>
```

- 要素に `data-annot` を付けると、その中の字は、説明する字の脇に添える注記（`m-kanbun` の返り点・読む順の番号など）だと示す：その要素の中の字（子孫もすべて、SVG の字も）を、字が小さい（`smallText`・`smallSvgText`。R-fit の 24px・27px の最小）として知らせてはならない。ほかの検査（`textClipped`・`bodyBottom` など）も表示も変えてはならない
- `data-annot` が効くのは、パーツが mount で作った要素だけで、書き手が書いたものには効かない：プレーヤーは、パーツが mount する前に、スライド自身の記述にある `data-annot`（`m-*` の中に手で書いた子も）をすべて外すので、印を付けて小さい字を逃れることはできない。パーツは mount の中で付ける
- パーツは `data-annot` は、字の中を指す短い印（数字や数文字）にだけ使い、内容には使わない：文・図の札・表のセルは注記ではない。最小を守れるところは守り、この印は最後の手段にする

## 11. ライブの板（拡張 live。下書き）

ライブを付けてエクスポートした再生専用の写しにだけ、ライブのプレーヤー（`kit/live.js` と `kit/core/live-policy.mjs`。`kit/core/live.mjs` が入れる）が入る。ほかの出力は変わらない。ふるまいの正本は形式の[拡張 `live`](https://github.com/egatari/egatari-spec/blob/main/extensions/live.md)、通信は [egatari/live](https://github.com/egatari/live)。ここに書くのは Studio の実行系の約束。

- 板は初めたたんでいる：出すのは印 `#live-mark`（`aria-expanded` を持つ `<button>`。右上）だけで、`#stage` は窓いっぱい（`fit()` の置き方のまま）。印は、つながりの状態（`data-state`・色の点・読み上げ用の字）を見せる。板は、印を押すと開き（たたむまで開いたまま）、投票（`*` でないもの）のあるステップでは、ライブの時間の中で、つなげるか「ブラウザで参加する」を出せる文書なら自分で開く。そのステップを離れると、参加者が **開いたままにする** を押していなければたたむ。開いたことは板の外の polite な live region で知らせ、フォーカスは動かさない
- 開いた板は舞台の外：`#live-pane` は右（縦長の窓では下）に置き、`#stage` は残りの場所に `fit()` と同じ式で収める。`DECK.seek(i, k, t)` の描くもの・字幕・印・印刷を変えてはならない。動画（`?mode=video`）・発表者ビューとその中の画面（`?presenter`・`?view`）では板を作らず、印刷では（印も）隠す
- `deck:pos`（`detail.key`）は、どの投票を出すか・板を開くかを決めるためだけに聞く。位置や時間は送らない。時計（つなぎ直し・つながりを保つ ping・ライブの時間の終わり）を使うが、舞台に何も描かないので許される
- endpoint は `https:` でなければならない。ループバックの `http:` を許すのは、試験が `buildPortable(…, {liveDevLoopback: true})`（コマンドの引数にはしない）で組む開発版のプレーヤーだけ。切り替えは `kit/core/live-policy.mjs` の定数で、その組み立てだけが入れる。配る教材のプレーヤー・編集アプリのエクスポート・`kit/build.mjs --live` は `http:` を断る
- つなぐのは「参加する」の後、ライブの時間の中（2 分のゆとり）で、枠の中でない `file:`・`http(s):` の文書のうち、CSP の `<meta>` がちょうど 1 つでその `connect-src` が endpoint と同じものだけ。ほか（枠・`srcdoc`・sandbox やプレビューの文書）ではライブの場所を字で見せる
- 質問（下書き）：ライブの時間の中で、ライブに `qa` の活動があれば、板の外の右下に **?**（`#live-ask .lv-q`。`aria-label` を持つ `<button>`、44 px 以上）を出す。押すと板を開いて質問の欄へ（まだ参加していなければ「参加する」へ）。自分からはつながない。質問には、送るときに画面にあるステップの鍵（`slideKey:stepKey`。欄にはスライドとステップを言葉で出す）と、教材の版 `sourceSha256`（再生専用の `deck-meta` にはないので、`kit/core/live.mjs` が書き出すブロックの `live.sourceSha256` に入れる）と、任意で囲んだところを付ける。**囲む**（`aria-pressed`）で舞台の上に描く層 `#live-ink`（舞台の座標の SVG。`#stage` の外。Esc で終わる）を出し、線は `LivePolicy().normStrokes`（20 本・1 本 500 点・合わせて 2000 点まで）で整える。囲んだところはそのステップのもので、ステップが変われば消す（知らせる）
- **わからない**（`#live-ask .lv-cf`。`aria-pressed`）は、参加中で、ライブに画面のステップの `confused` の活動があるとき **?** の横に出す。押すとそのステップに印を付け、もう一度押すと取り消す。自分の質問へのホストの返事は、板の **ホストからの返事** に並べる（読み直した後も、参加するときにライブがもう一度送る）。新しい返事は知らせ、板をたたんでいれば `#live-mark` に印を付ける。サーバーの字は字のまま。**?**・**わからない**・描く層は、印刷では隠し、動画と発表者ビューでは作らない

## 12. テーマと体裁の CSS

テーマ（`tokens.css`）は、どの組み立ての口でも、`kit/base.css` と `kit/layouts.css` の後（`kit/latin.css` の前）に読む。なので、テーマは変数だけでなく体裁の規則も上書きできる：表紙・章の扉・見出し・`.body` の余白・結論の行・ページ番号・箇条書きの印・進み具合の帯。`html` を前に付けるなどして詳細度で勝たなくてよい。

- テーマが何を替えても、色の変数は形式 §8.4 の意味のまま。パーツはその変数だけを使い、品質チェックの色の決まり（`--bg` とのコントラスト）はどのテーマにも効く
- 体裁の箱を動かすテーマにも品質チェックは効く。テーマは箱の場所を `theme.json` の `metrics`（`"v": 1`）で宣言する。値は 1280×720 の舞台の px で、項目は `body.left`・`body.right`・`body.top`・`body.floor`・`body.line`・`concl.top`・`concl.height`・`tate.rule`・`tate.conclRight`・`tate.left`・`tate.floor`（意味と既定は[リファレンス](reference.ja.md#テーマ)）。書かない項目は `extends` の親から項目ごとに、親もなければ既定（今の `kit/layouts.css`）から取るので、`metrics` のないテーマは今までとまったく同じに検査する（[形式の仕様](https://github.com/egatari/egatari-spec) §6）
- 品質チェックは、本文の場所の限り（`bodyBottom`・`bodyRight`・`tateBodyHead`・`bodyConclCol`・`bodyLeft`）をこの値から導く。`metrics` が動かすのは限りの場所だけで、限りそのものは変えない：余裕（結論の行の上 6px、横の 4px）、字の大きさの最小（R-fit）、見出しと結論の字数（R-title・R-concl）は `metrics` では変わらない
- 同梱のテーマ（`themes/`）と公式のテーマ庫のテーマが本文・結論の行・縦組みの列を既定の場所から動かすなら、`metrics` を宣言しなければならない。その CSS が描く箱が宣言と 1px を超えて違えば `tools/test-theme-metrics.mjs` が失敗する。ほかのテーマ（自分のテーマ）は宣言を勧める：品質チェック（`npm run check` と編集アプリの品質チェック）は、描いた箱が宣言と 1px を超えて違うとき、または `metrics` のないテーマが箱を動かしたとき、教材に 1 回 `themeMetricsDrift` を警告する。警告は項目ごとに宣言の値と描いた値、箱を動かしたのがテーマの CSS かスライドの `<style>` かを言う。箱を測るのは同梱の字体が読み込まれてから（`document.fonts.ready` の後、見出しとページ番号の字体が読み込み済みと答えたとき）だけで、代わりの字体では測らない：読み込めなければ比べずに、教材に 1 回 `metricsFontLoad` を警告する。`node tools/theme-metrics.mjs measure <テーマ>` が、描いたテーマから測った塊を出す。値は整数の px で、どの端も限りが緩くなる側へ外向きに丸める（1px 未満なので、丸めだけではずれにならない）
- スライドは `metrics` を持たず、変えられない：箱を動かすスライドの `<style>` には `themeMetricsDrift` が出て、限りはテーマのまま。数でない・範囲の外・ほかの値と合わない値は組み立ての警告（`theme-metrics: …`。品質チェックは教材に 1 回の `themeMetricsInvalid` にまとめる）で、その項目は（合わない値なら、そのテーマの塊ごと）親の値を使う
- `metrics` は検査と書き手の道具のためだけのもの。プレーヤーは描くのに使わない（描くのは CSS だけ）。テーマの同一性には入る：`theme.json` はほかのテーマのファイルと同じくテーマの `sha256` に数える
- 同梱のテーマは変数だけを決めるので、この順で見た目は変わらない

## 13. レビューのメモ：手書きの印

レビューのメモは作業フォルダの `comments.json` の項目（[形式の仕様](https://github.com/egatari/egatari-spec) §3.3）。配る物には入れない：Egatari ファイル（.ega.html）は、再生専用でもそうでなくても `comments.json` を入れない。項目は `{id, created, key, range, pin?, strokes?, quote, comment, status, resolved?}`。この節はスライドの上の場所 2 つの形を決める（ほかの読み手、たとえば作業フォルダにメモを取り込む Egatari Live の今後のレビューの機能が、同じ形を使えるように）。

- 座標：スライドの座標（1280×720、原点はスライドの左上）。表示の倍率・窓の大きさによらない。点はステップ `key` の最後の状態（`DECK.seek(i, k, Infinity)`）を指す
- `pin`（なくてもよい）：`{x, y}`。0 ≤ x ≤ 1280、0 ≤ y ≤ 720 の数で、0.1 に丸める。Alt+クリックのメモは押した点、マーカーは全部の線の重心
- `strokes`（なくてもよい。`pin` があるときだけ）：マーカー（編集モードの `m`）で描いた印。折れ線の並び `[[[x, y], …], …]`：
  - 1 つのメモに線は 1 本でも何本でも（丸と矢印、いくつもの下線）：20 本まで、1 本 500 点まで、合わせて 2000 点まで
  - 線はどれも 2 点以上。点は数の組で、スライドの中に寄せて 0.1 に丸め、続く 2 点は同じにしない。点はほかのもの（筆圧・時刻）を持たない。読み手は線ごとに開いた折れ線として描く
  - 重心（マーカーの `pin`）：全部の線について、区間の中点を区間の長さで重みを付けて平均したもの Σ ℓᵢ·mᵢ / Σ ℓᵢ（長さが 0 なら 1 本目の最初の点）。メモの `key`・`range`・`quote` はこの重心の下の要素から取る
- 確かめ方（`kit/core/comment-core.mjs` の `normStrokes`。開発サーバーと編集アプリの書き込みが共有する 1 つの規則。書き込みは `pin` を確かめた線の重心にする）：配列でない・200 本を超える・点が合わせて 20000 を超えるものは線なし（メモは線なしで残す）。線ごとに、配列でない・5000 点を超える・正しい別々の点が 2 つに満たないものは捨て、正しくない点は捨て、残りを寄せ・丸め・続けて同じ点を 1 つにし、500 点を超えれば Ramer–Douglas–Peucker で間引く（両端は残し、許す誤差は 0.25 から、500 点以下になるまで倍にする）。初めの 20 本を使い、点が合わせて 2000 を超える間は、全部の線を同じ誤差（0.25 から倍にする）でさらに間引く。線が残らなければ線なし
- 前の項目：`pin`・`strokes` のない項目もそのまま使える。何本もの線を描けるようになる前の項目は `stroke`（折れ線 1 本 `[[x, y], …]`）を持つ。読み手はそれを `strokes: [stroke]` として読まなければならない（MUST。`entryStrokes`。両方あれば `strokes`）。書き込みは `strokes` だけを書く。読み手は読めない線を無視し、メモは見せなければならない（MUST）
- 見せ方：編集の画面は線をプレビューの上の自分の重ね（`#dev-pins`）に、ピンと同じ色（一覧のメモは赤、書いている途中は橙）で描き、スライドの DOM には描かない。`npm run comment-shots` は全部の線を両方の画像に描き、切り抜きを全部の線の外接矩形＋48 px まで広げる
