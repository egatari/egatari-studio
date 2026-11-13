---
name: icons
version: 1.0.0
kind: library
summary: 名前で引く線のアイコン（Tabler Icons outline 3.49.0、MIT、4,808 個。brand-* と塗りのアイコンは入れない）。教材の作者が直接は書かない
---

A library part (Egatari spec §6.1): it defines no element. Parts that draw an icon the lesson names (`m-cards`) require it
as `requires: {icons: "1.0.0"}`:

```js
var I = deps.icons;
var g = I.svg("chart-bar", {x: 10, y: 10, size: 40, cls: "term", missing: function(m){ ctx.report("data", "[cards] " + m); }});
I.has("chart-bar");   // true
I.near("chart-barr"); // ["chart-bar", …] up to 3 carried names by edit distance
I.names();            // the names this copy carries (in a lesson, only the ones it names)
```

- `svg` returns an SVG `<g aria-hidden="true">`: the 24-unit box scaled to `size`, stroke `currentColor` (2 units), round caps
  and joins. The colour comes from the caller's class (`term`, `emph`, `muted`); nothing is hard-coded.
- An unknown name draws an empty dashed box of the same size (`data-missing`) and calls `missing` once with the closest names.
- The lesson's names: `m-cards` lists the curated names (about 120) in its README. Any Tabler outline name works; the full
  list is `names.txt` (one per line), for the quality check's "did you mean".

<!-- llm: omit -->
作る人向けの注

- **データ**：`/*@egatari-block icons*/` と `/*@egatari-block-end*/` の間は `node tools/icons-import.mjs` が書く（手で直さない）。npm の `@tabler/icons` の tarball をバージョン（`PIN`）と sha256 で固定して取り込み、`tabler-nodes-outline.json` の各 path の `d` だけを残す。`fill="currentColor"` の path は先頭に `+`、`fill="currentColor" stroke="none"` は `*`。`brand-*`（商標。MIT が許すのは絵で、印ではない）と塗りの版（filled）は入れない。Tabler を上げるのは `PIN` を書き換える明示の更新だけ。`--check` は区切りの中・`names.txt`・知らせが合っていることを確かめる（ネットワークなし）
- **絞り込み**（仕様 §6.2 subset by name、`match: "name"`）：ファクトリの返す値の `build` で宣言する（ライブラリパーツの宣言の置き場。仕様 3d4ead0）。組み立てはレッスンの字句（a–z・0–9・`-` 以外で区切った語）と完全に一致する名前だけを残す。`chart-bar-popular` は `chart-bar` を残さない。`keep` はない（`m-cards` は名前をすべてレッスンのデータから取る）
- **探すための語**（#160）：`<言語>.json`（`{"_tabler": バージョン, "_lang": 言語, "<名前>": [語, …]}`、どの言語も同じ形）。編集アプリがアイコンを語で探すのに使う。`index.js` には入らないので、レッスンの絞り込みには関わらない。`en.json` は Tabler の tags から `icons-import` が書く。`ja.json` は中核のアイコン（約 400）に日本語の語を 3〜6 つ、よく使う語から（LLM で下書きし、人が確かめる）。ない言語は en に落とす。`--check` は `_tabler` が `PIN` と同じこと、名前が Tabler にあること、語が重ならないことを確かめる
- **ライセンス**：MIT（Tabler Icons、Copyright (c) 2020-2026 Paweł Kuna）。`LICENSE-tabler.txt` とリポジトリの `NOTICE`、区切りの中の `_notice` が対になる（絞り込んでも `_notice` は残る）
<!-- llm: end -->
