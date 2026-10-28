---
name: markup-reader
version: 1.0.0
kind: library
summary: 組み立てのときに描いた結果（KaTeX の HTML・MathML、abcjs の SVG）を、決まった要素と属性だけで読んで置く。教材の作者が直接は書かない
requires: base@1.0.0
---

**2.0 alpha (branch `c2-a3a`; not for lessons).** A library part (Egatari spec §6.1). Parts that show build-time rendered
output (spec §6.2) insert it only through this reader: today the six parts with `tex` fields (`m-collect`, `m-cycle`,
`m-fishbone`, `m-flow`, `m-timeline`, `m-tree`). `m-score` (abcjs SVG) reads only `LIST` (its svg entries) and keeps its
own tree reader, which its step plan uses without a DOM; the list is the same one. They require it as
`requires: {base: "1.0.0", "markup-reader": "1.0.0"}` and receive `{read, texFrame, sink, LIST}`:

```js
var MR = deps["markup-reader"];
var dropped = MR.read(markup, parent, "html");   // appends what is admitted; returns what was dropped ([] if nothing)
var sk = MR.sink(this, ctx);                     // in mount
MR.texFrame(g, x, y, node, "tex", {size: 26, anchor: "middle", color: "var(--fg)", w: 200, h: 70}, sk);
sk.flush();                                      // at the end of mount: once per kind, with the count, ctx.report("data", "[<name>] …")
```

- **What it admits is exactly egatari-spec's normative `schema/rendered-markup-1.json`** (§6.2 "Rendered output is data"):
  the listed elements per namespace (HTML, SVG, MathML), the listed attributes with the schema's value grammars (`id`,
  `data-*`, `fill`/`stroke` only `none` or `currentColor`), and `style` only as the listed properties with a length or a
  listed keyword, or the listed shorthands (margin, padding, border-width, border-style, border, border-<side>: each part a
  length or a listed keyword), each set with `style.setProperty` (`color` only as `transparent`). An element not listed is
  dropped with its subtree, an attribute or a style declaration only by itself; everything dropped is returned, and
  reported once per element and kind with its count. `xmlns` is the namespace declaration of serialised markup: it must
  name the element's namespace and is never set as an attribute.
- **No browser parser**: a small parser of its own (no `innerHTML`, no `DOMParser`); every element is made with
  `createElementNS` in its namespace.
- **The list is generated, never edited here**: `node tools/markup-sync.mjs` writes it from the schema at the egatari-spec
  commit pinned in `tools/spec.json`; `tools/test-markup-reader.mjs` checks that the embedded copy equals the schema, and runs
  KaTeX's builder corpus through the reader: only the losses the spec documents (colours of `\color`, `\textcolor`,
  `\colorbox`, `\fcolorbox`, `\pmb`'s shadow, `mathcolor`, `mathbackground`, KaTeX's error colour) may be dropped.
  Additions are made in the spec, never in a reader.
- **`texFrame`** places a formula in an SVG figure as Egatari Studio's `kit/deck.js` did at play time (MIT, the same owner;
  see NOTICE): a `foreignObject` (class `smath`) with an inline-block `div` of the given size and colour, `x` the anchor and
  `y` the baseline. The formula is the producer's output `node[key + "Html"]` (e.g. `texHtml` beside `tex`). Without it (a
  file built without the renderer, or after a tier A edit of the field) the `div` shows the TeX source as plain text and the
  part reports `"[<name>] N tex field(s) not rendered at build time, …"` (spec §6.2 Missing output).
