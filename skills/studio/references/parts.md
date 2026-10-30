Always reply in the language the user writes in, not the language of this file. Write slides and narration in the deck's language (`<html lang>`); for a new deck, the language the user asks for, or else the language they write in.

# egatari-studio:studio：パーツを書く

CLI 専用。書き方の決まりは先に `egatari:make` を読む。以下はパーツライブラリ 2.0 の手順。使う Studio が `egatariParts.define` と必要なライブラリに対応しているか、既存のパーツと実行系で確かめる。1.x の写ししかない環境に 2.0 のコードをそのまま入れない。

リポジトリ：studio スキルの SKILL.md のあるフォルダから 2 つ上（プラグインの根。`<repo>`）。初回は `<repo>` で `npm ci` を案内する。約束事の正本は `<repo>/docs/contract.ja.md §1〜3`。一覧は `<repo>/vendor/components/CATALOG.md`。

**パーツライブラリは別のリポジトリ [egatari/components](https://github.com/egatari/components)**。Studio の `<repo>/vendor/components/<名前>/<版>/` はそのリリースの写しで、手で直さない（直しても `npm run components:check` が落ちる）。パーツライブラリのパーツを直す・足すのは egatari/components で行い、Studio にはリリースを `npm run components:update -- vX.Y.Z` で取り込む。

Egatari ファイル（オープンなファイル形式。拡張子 `.ega.html`。`node <repo>/kit/build.mjs <deck> --portable`）では、パーツライブラリのパーツは名前・版・`index.js` の hash の付いたパーツライブラリのパーツとして入り、編集アプリ（Egatari Studio、<https://studio.egatari.org/>）は同じ hash の版で組み直せる。作業フォルダの `components/` のパーツはその教材独自のコードとして扱われ、編集アプリはプレビューで動かす前に確かめる。

## 1. まず既存のパーツと動きの素で足りないか確かめる

`vendor/components/CATALOG.md` と各 `demo.html` を見る。属性を足せば済むなら、新しく作らずに既存のパーツを広げる（egatari/components への提案になる。§5）。

多くの図はパーツにしなくてよい：インライン SVG と `data-step`・強調（`{mark}`）・モーフ（`data-morph`）（Studio の実行系の動きの素。形式の仕様 §8.5・§8.6、`docs/contract.ja.md §7・§8`）で動かせる。パーツにするのは、データから配置を計算する・要素が多い・操作がある・授業をまたいで使う、といったときだけ。

## 2. 書き方（その教材専用のパーツ）

置き場所：`<deck>/components/<名前>/index.js`（build は作業フォルダ → パーツライブラリの写しの順に探す）。

```js
// m-example：何を見せるか 1 行
// 版は使うライブラリの README と manifest で確かめ、完全な版番号で固定する。
egatariParts.define({name: "example", version: "1.0.0", requires: {base: "1.0.0"}, element: "m-example"}, function(deps) {
  const base = deps.base;
  return class extends base.MotionElement {
    static partName = "example";
    static steps = 2;
    static props = { dur: {type: "number", default: 1.2, doc: "1 ステップの動きの秒数"} };
    mount(ctx){ /* 1 回だけ：base.el で SVG を作る */ }
    duration(k){ return k >= 1 ? this.props.dur : 0; }
    cues(k){ return null; }               // 台本の {cue} に合わせたい同期点（秒）
    render(k, t, ctx){ /* (k, t) だけから状態を決めて描く */ }
  };
});
```

`name` はフォルダ名、`element` はタグ名、`static partName` は `name` と同じ。`requires` に使うライブラリと完全な版番号を並べ、factory で `deps` から受け取る。軸を描くなら `plot` を依存に加え `deps.plot.Plot` を使う。プレーヤーのグローバルには依存しない。

パーツの README とリリースの manifest の分類を合わせる：

- `kind`：`element`（教材に置くパーツ）か `library`（ほかのパーツが使うライブラリ）。library は `element` を持たず、factory から API を返す
- `tier`：`standard`（標準）・`specialized`（専門）・`extra`（特殊）
- `set`：専門パーツのセット。既存 manifest のセット名を使い、固定の分野一覧から推測しない
- `display`：タグとは別の表示名が必要なときの日本語・英語名

守ること（品質チェック `kit/check.mjs` と egatari/components の試験が確かめる）：

1. **(k, t) だけで画面を決める**。前回の render の状態に頼らない。`setTimeout`・`requestAnimationFrame`・`Date`・シードのない乱数は使わない
2. t = Infinity はステップ k の最終状態、k = 0 は初期状態
3. 色は `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)` だけ（`base.el` は fill / stroke の `var()` を style に回す）
4. 図の文字は 24px 以上。凡例ではなく線の近くに直接書く
5. 数値は検算済みのスクリプトの出力（子の `<script type="application/json">` → `this.data`）だけを使う
6. 補間は `base.prog(t, 始め, 長さ)`（0〜1、イージング付き）と `base.lerp`
7. 図の中の式は、使う版の README に従い組み立て時に描く。簡単な記号は `base.mtext`（`*u*_0`）
8. データの形を `static shape = {schema, example}` に書く（`kit/shape.js`：JSON Schema の小さな部分集合。字で書くパーツは `{text: true, example}`、子の `<a href>` なら `{links: true, example}`）。実行系が描く前に確かめ、違えばパーツの代わりに札を出して、品質チェックが「どこが・何のはずが・どう書くか」を指摘する
9. パーツの字は、どんなデータでも互いに重ならず、パーツの線にも重ならないように置く（品質チェックは SVG の字どうしの重なりを警告する）。意図して重ねる字だけは、その `<text>` か祖先の `<g>` に `data-overlap="ok"` を付ける（わざと切る字の `data-clip` と同じ付け方。パーツ全体には付けない）

## 3. 確かめる

教材を組んで品質チェックにかけ、スクリーンショットを目で見る（動きの途中と最終状態）：

```bash
node <repo>/kit/build.mjs <deck>/deck.html && node <repo>/kit/check.mjs <deck>/deck.html   # 終了コード 2（--json は status: "crashed"）は検査が終わっていない：エラー 0 ではない
node <repo>/tools/shot.mjs <deck>/out/deck.html /tmp/s.png <i> <k>
```

失敗して直したことは、そのパーツの README に「注意」として書く（次に書く人が同じ失敗をしないように）。

## 4. パーツライブラリに入れる条件

その教材専用に書いたパーツは、次のどちらかを満たしたらパーツライブラリ（egatari/components）への提案を考える。

- 2 つ目の教材で使われた
- 内容に依存しない形に書けた（データと文言をすべて属性か JSON で渡せる）

## 5. パーツライブラリへの提案（egatari/components の Issue）

条件を満たしたとき、またはユーザーに頼まれたときは、egatari/components への提案を**申し出る**（勝手には送らない）。名前は提案のときにパーツライブラリの管理者が決めるので、仮の名前のままでよい。

1. 「このパーツをパーツライブラリ（egatari/components）に提案しますか」と聞く。断られたらそれで終わり
2. 下書きを作って**全文をユーザーに見せる**。テンプレート `proposal.yml` の欄に合わせ、本文を次の見出しで書く：
   `### Example / 例`（教材の中のインライン SVG の図か画像）・`### Lesson used in / 使った授業・発表`・`### Data shape (draft) / データの形（案）`・`### Steps and final state / 段階と最終状態`・`### Why inline SVG and the motion primitives are not enough / インライン SVG と動きの素では足りない理由`・`### Rights / 権利`（文章・データ・画像・コードの出典とライセンス）・`### What must be readable when static / 静止したときに読めなければならないもの`（印刷・本・スクリーンリーダー）・`### Other fields and lessons / ほかの分野・授業での使い道`
   - その教材だけの文言・未公開のデータ・個人のパスを入れない（例の数値は作り物にする）
3. ユーザーが「送って」と明示したときだけ送る：
   ```bash
   gh issue create -R egatari/components --title "[proposal] <何を見せる図か>" --label proposal --body-file <下書き>
   ```
4. 作った issue の URL をユーザーに伝える。名前が決まった後のコード（`components/<名前>/` の index.js・README.md・demo.html）・試験（`npm test`）・プルリクエストは egatari/components の CONTRIBUTING に従う。リリースされたら Studio で `npm run components:update -- vX.Y.Z` → `npm run gen` → `npm test`。egatari:make スキルの参照ファイルも同じ生成で更新される
