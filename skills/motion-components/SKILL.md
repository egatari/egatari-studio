---
name: motion-components
description: motion-academic-slides の動く図の部品（Web Components）を新しく書く・直す・部品庫に昇格させる。「新しい部品を作って」「この図を部品にして」「部品庫に入れて」「motion-components」で使う。部品を使ってスライドを作るだけなら motion-slides。
---

# motion-components：動く図の部品を書く

リポジトリ：このファイルの 2 つ上（`<repo>`。`~/.claude/skills/` にシンボリックリンクで入れたときは、リンク先の実体の 2 つ上。`realpath` で確かめる）。約束事の正本は `<repo>/docs/contract.md §1〜3`。一覧は `<repo>/components/CATALOG.md`。

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

守ること（検査器 `kit/check.mjs` と `tools/test-components.mjs` が確かめる）：

1. **(k, t) だけで画面を決める**。前回の render の状態に頼らない。`setTimeout`・`requestAnimationFrame`・`Date`・シードのない乱数は使わない
2. t = Infinity は段階 k の最終状態、k = 0 は初期状態
3. 色は `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)` だけ（`DECK.el` は fill / stroke の `var()` を style に回す）
4. 図の文字は 24px 以上。凡例ではなく線の近くに直接書く
5. 数値は検算済みのスクリプトの出力（子の `<script type="application/json">` → `this.data`）だけを使う
6. 補間は `DECK.prog(t, 始め, 長さ)`（0〜1、イージング付き）と `DECK.lerp`
7. 図の中の式は `DECK.svgMath(親, x, y, "TeX", {size, anchor})`、簡単な記号は `DECK.mtext`（`*u*_0`）

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
