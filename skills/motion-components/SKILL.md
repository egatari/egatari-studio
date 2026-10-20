---
name: motion-components
description: Egatari Studio（旧 motion-academic-slides）の動く図の部品（Web Components）を新しく書く・直す・部品庫に昇格させる。「新しい部品を作って」「この図を部品にして」「部品庫に入れて」「部品庫に提案して」「motion-components」で使う。部品を使ってスライドを作るだけなら motion-slides。
---

# motion-components：動く図の部品を書く

リポジトリ：このファイルの 2 つ上（`<repo>`。`~/.claude/skills/` にシンボリックリンク（Windows ではジャンクション）で入れたときは、リンク先の実体の 2 つ上。`realpath`（Windows の PowerShell なら `(Get-Item <パス>).Target`）で確かめる）。約束事の正本は `<repo>/docs/contract.ja.md §1〜3`。一覧は `<repo>/components/CATALOG.md`。

Egatari（オープンなファイル形式。拡張子 `.ega.html`）の 1 ファイル（`node <repo>/kit/build.mjs <deck> --portable`）では、部品庫（`<repo>/components/`）の部品は版と hash の付いた部品庫の部品として入り、編集アプリ（Egatari Studio、<https://studio.egatari.org/>）は同じ hash の部品で組み直せる。作業フォルダの `components/` の部品はそのデッキ独自のコードとして扱われ、編集アプリはプレビューで動かす前に確かめる。広く使う部品は部品庫に入れる（§4）。

## 1. まず既存の部品で足りないか確かめる

`CATALOG.md` と各 `demo.html` を見る。属性を足せば済むなら、新しく作らずに既存の部品を広げる。

## 2. 書き方

置き場所：デッキ専用なら `<deck>/components/<名前>/index.js`、汎用なら `<repo>/components/<名前>/`（build はデッキ → リポジトリの順に探す）。

```js
// m-名前：何を見せるか 1 行
DECK.define("m-名前", class extends DECK.MotionElement {
  static steps = 2;
  static props = { dur: {type: "number", default: 1.2, doc: "1 段階の動きの秒数"} };
  mount(ctx){ /* 1 回だけ：DECK.Plot や DECK.el で SVG を作る */ }
  duration(k){ return k >= 1 ? this.props.dur : 0; }
  cues(k){ return null; }               // 口述原稿の {cue} に合わせたい同期点（秒）
  render(k, t, ctx){ /* (k, t) だけから状態を決めて描く */ }
});
```

守ること（品質チェック `kit/check.mjs` と `tools/test-components.mjs` が確かめる）：

1. **(k, t) だけで画面を決める**。前回の render の状態に頼らない。`setTimeout`・`requestAnimationFrame`・`Date`・シードのない乱数は使わない
2. t = Infinity は段階 k の最終状態、k = 0 は初期状態
3. 色は `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)` だけ（`DECK.el` は fill / stroke の `var()` を style に回す）
4. 図の文字は 24px 以上。凡例ではなく線の近くに直接書く
5. 数値は検算済みのスクリプトの出力（子の `<script type="application/json">` → `this.data`）だけを使う
6. 補間は `DECK.prog(t, 始め, 長さ)`（0〜1、イージング付き）と `DECK.lerp`
7. 図の中の式は `DECK.svgMath(親, x, y, "TeX", {size, anchor})`、簡単な記号は `DECK.mtext`（`*u*_0`）
8. データの形を `static shape = {schema, example}` に書く（`kit/shape.js`：JSON Schema の小さな部分集合。字で書く部品は `{text: true, example}`、子の `<a href>` なら `{links: true, example}`）。実行系が描く前に確かめ、違えば部品の代わりに札を出して、品質チェックが「どこが・何のはずが・どう書くか」を指摘する。指示の部品の一覧にも出る（`node tools/make-llm-guide.mjs`）

## 3. 確かめる

```bash
node <repo>/tools/test-components.mjs <名前>     # 描画・決定性・文字の大きさ・重なり。スクリーンショットも出す
```

スクリーンショットを必ず目で見る（動きの途中と最終状態）。

## 4. 部品庫への昇格

デッキ専用に書いた部品は、次のどちらかを満たしたら `<repo>/components/` に移す。

- 2 つ目のデッキで使われた
- 内容に依存しない形に書けた（データと文言をすべて属性か JSON で渡せる）

昇格のときにすること：

1. デッキ固有の文言・数値を props か JSON に出す
2. `README.md`（frontmatter に `name` `summary` `steps` `props`、本文に「いつ使うか」）と `demo.html`（1〜2 枚の見本デッキ）を書く
3. `node <repo>/tools/test-components.mjs <名前>` を通す
4. `node <repo>/tools/catalog.mjs` で CATALOG.md を作り直す
5. motion-slides スキルの §6 の表に 1 行足す

失敗して直したことは、その部品の README に「注意」として書く（次に書く人が同じ失敗をしないように）。

## 5. 部品庫への提案（公開リポジトリへ送る）

デッキ専用の部品が §4 の条件を満たしたとき、またはユーザーに頼まれたときは、公開リポジトリ（`egatari/egatari-studio`）への提案を**申し出る**（勝手には送らない）。

1. 「この部品を部品庫に提案しますか（issue か PR）」と聞く。断られたらそれで終わり
2. 下書きを作って**全文をユーザーに見せる**
   - issue：`.github/ISSUE_TEMPLATE/component-submission.yml` の欄に合わせ、本文を `### Component name` / `### What it shows` / `### Code or PR link` / `### Checklist`（`- [x]` で確かめたものだけ）の見出しで書く
   - PR：`components/<名前>/`（index.js・README.md・demo.html）と CATALOG.md を足したブランチ。説明に同じチェックリスト
   - デッキ固有の文言・未公開のデータ・個人のパスを入れない（demo.html の数値は作り物にする）
3. ユーザーが「送って」と明示したときだけ送る：
   ```bash
   gh issue create -R egatari/egatari-studio --title "[component] m-名前" --label component-submission --body-file <下書き>
   # PR なら：fork → ブランチに push → gh pr create -R egatari/egatari-studio --body-file <下書き>
   ```
4. 作った issue / PR の URL をユーザーに伝える
