---
name: m-score
version: 2.0.0
series: music
tier: specialized
set: music
summary: 楽譜（五線譜）を 1 音・和音ずつ、または 1 小節ずつ出して音も鳴らす。ABC 記譜法で書く
steps: 音符・和音・休符 1 つ＝1 段階。by="measure" なら 1 小節＝1 段階
purposes: music
variants: light
props: by, names
---

子の JSON：`{"abc": "X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F | G2 G2 |]"}`

- `abc`：ABC 記譜法。`M:` 拍子、`L:` 基本の長さ、`Q:1/4=96` 速さ、`K:` 調、`[CEG]` 和音、`z` 休符、`-` タイ
- `names`：符頭の下に `solfa`（ドレミ）・`abc`・`iroha`（ハニホ）。既定は `none`
- `by="measure"`：1 小節ずつ（音は小節の中で順に鳴る）

<!-- llm: omit -->
作る人向けの注

- **組み立てのときの描画**（部品庫 2.0 §4.1）：作り手が `abc` を abcjs（`add_classes: true`、`foregroundColor: "currentColor"`）で描き、`abcSvg`・`abcMap` と、データの一番上に `renderers: {abcjs: {version, options}}` を足す（仕様 §6.2）。再生のときに abcjs は持たない。描いていないデータ（`abc` だけ）は `abc` をそのまま字で見せ、`ctx.report("data")` で 1 回知らせる（段階はない）。`static build = {fields: {abc: "abcjs"}}`
- **abcMap**：`tempo`（四分音符 / 分）と `notes`（譜面の順）。音符ごとに `cls`（その要素だけが持つ abcjs の class 全部、`"abcjs-v0 abcjs-mm1 abcjs-n2"`）、`measure`（小節の通しの番号）、`pitch`（`["C4"]`、和音は複数、休符は `[]`）、`beat`（小節の頭からの拍、四分音符 = 1）、`dur`（拍）、`box`（符頭の箱 `[x, y, w, h]`、SVG の座標）。`beams`：連桁が結ぶ音符の番号の組。`arcs`：`{kind: "tie" | "slur", from, to, pitch?, n}`（タイは音の高さごと。和音の一部だけのタイも書ける）。
- **SVG は信用しない**：innerHTML・DOMParser を使わず、仕様の描いた結果の一覧（egatari-spec の `schema/rendered-markup-1.json` の svg の欄。部品の `MARKUP` はそれと同じで、tools/test-score.mjs が比べる）の要素・属性・値だけで組み直す。`style` は一覧の宣言だけを setProperty で、`fill`・`stroke` は `none`・`currentColor` だけ、URL の属性はない。要素は中身ごと、属性・宣言はそれだけを捨て、種類ごとに 1 回 `ctx.report("data")` で知らせる。作り手（tools/score-fixtures.mjs）は一覧に入るものだけを書く（abcjs の `<style>`・`<title>`・`selectable`・`data-name` は書かない。`fill`・`stroke` は abcjs の置いたまま）
- **出し方**：組み立てが付けた印だけで選ぶ（abcjs の class は読まない。`cls` は組み立ての記録）：`data-note="i"` の音符・休符、`data-beam="k"` の連桁（`beams[k]` の最初の音符と）、`data-measure="m"` の小節線（小節の最後の音符と）、`data-arc="n"` の弧の線（タイは `to`、スラーは `from` の音符と）。印のないものは段階 0 から見える（五線・音部記号・調号・拍子）。印の要素がない音符・連桁・弧、知らない値は `ctx.report("data", "[score] …")`。段は SVG のいちばん上の子 1 つ
- **音**（仕様 §8.4）：`events(k)` は音の高さ 1 つに 1 つの `note`（`vel` 0.7、和音は同じ `t`）。タイの弧でつながる音の高さは、先の音符の分まで `dur` を延ばす（段階をまたいで鳴る）。休符と、タイの弧の `to`・`pitch` の音（タイの先）は鳴らさない
- 段は abcjs の `abcjs-l…` ごとに分け、段の下に名前の帯（26 px、和音は高い音が上の行。名前が重なる小節は、その小節の名前を全部ジグザグに：奇数番目の音符は上の段、偶数番目は下の段）を入れて、幅と高さに収まる倍率で描く。五線の間が 7 px より狭くなる・名前が重なる・高さが足りないと `ctx.report("size", "[score] …")`。`names` の知らない値は `ctx.report("attr", …)`
- abcjs の字（速さ・題名・歌詞）は小さいので、組み立ては `%%printtempo false` と `T:` なしで描く（見本もそう）
- 今の段階の音符は `--emph`、前は `--fg`。授業の表示では先の音符を `--preview-opacity` で薄く
- 見本の楽譜：fixtures/*.json と demo.html は tools/score-fixtures.mjs（組み立ての代わり）が abcjs 6.7.2（MIT、Paul Rosen and Gregory Dyke）で描いたもの（fixtures/LICENSE-abcjs.txt）。`ties.json` は試験だけ。abcjs の読み方（class・弧を描く順・癖）は fixtures/ABCJS-ADAPTER.md にあり、パーツには持ち込まない。曲は作った練習と、かえるの合唱（ドイツ民謡、パブリックドメイン）
<!-- llm: end -->
