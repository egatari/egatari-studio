# m-flow changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.5 (components 2.7.0)

- Requires base 1.2.0 and markup-reader 1.0.2 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.4 (components 2.6.1)

- Fix: an edge between boxes that are apart along one axis ends at the middle of the target's facing side and starts on the source's facing side, as near the target's centre line as that side allows. Centre-to-centre lines entered wide, flat targets through their top or bottom, so a fan-out to stacked boxes ended between boxes or at the wrong box.
- A `shift` (or the automatic one of a two-way pair) between facing sides runs along the sides, so both ends stay on them; an end pushed off its side is reported (`layout`).
- tools/test-flow.mjs checks that every edge starts on its source and ends on a side of its target (fan-out, fan-in, stacked, diagonal, two-way, diamond).

## 2.0.3 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and markup-reader 1.0.1.
- Fix: edge text is placed by base's measured textWidth in the deck's font (digits and Latin were 0.6 em, so the space kept free for a label with numbers could be too short).
- Fix: in a box label of several lines, a line with a subscript (_) and the next line with a superscript (^) are moved apart by what the 24px sub- and superscripts of base 1.1.0 reach (they touched at 1.25 lines); labels without them are placed as before.

## 2.0.2 (components 2.1.2)

- Fix: an edge from a box to itself without `loop` had zero length, gave NaN coordinates and drew a stray arrowhead in the top-left corner. It is now drawn as a small loop on the right of the box (from 1/4 and 3/4 of its side), with a `data` report naming the edge; with `loop` it is the same loop on that side. An edge between two boxes with the same centre is reported and not drawn.
- Fix: duplicate node ids were silently accepted (edges went to the last one). They are now reported (`data`), and edges still use the last node with that id.

## 2.0.1 (components 2.0.0)

- Text kept clear (#140): two edges between the same two boxes in opposite directions, neither with `shift` or `loop`, are drawn 10 px each to their right. An edge's label and amount keep clear of the other edges' lines, of texts placed before them and of places where another line runs between the text and its own line; the amount may go to the label's side. When no place is free, `ctx.report("layout", …)`. The demos draw as in 2.0.0 (tools/test-c2-identity.mjs, tools/test-overlap.mjs).

## 2.0.0 (components 2.0.0-rc.1)

- Moved to `egatariParts.define({name: "flow", version: "2.0.0", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-flow"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity`; `static partName = "flow"`.
  The DOM is byte-identical to 1.13.0 at every step (tools/test-c2-identity.mjs, with the formulas rendered at build time on the 2.0 side).
- Formulas are rendered at build time (Egatari spec §6.2), no longer by KaTeX at play time: `static build = {fields: {"nodes[].tex": "katex"}, options: {katex: {output: "html"}}}`. The producer adds `texHtml` beside each `tex` and `renderers: {katex: {version, options}}` at the top of the data (the shape now allows both). The part reads `texHtml` through `markup-reader` 1.0.0 (exactly the elements, attributes and style declarations of egatari-spec's `schema/rendered-markup-1.json`; anything else is dropped, an element with its subtree, an attribute or style declaration by itself, and reported at the end of mount once per kind with its count as `ctx.report("data", "[flow] …")`) into the same frame 1.13.0 drew (`foreignObject.smath` with an inline-block `div`), so the formula's DOM is that of 1.13.0's.
- Without `texHtml` (a file built without the renderer, or after a tier A edit of a `tex`) the `tex` source is shown as plain text in the same frame and reported once with the count: `ctx.report("data", "[flow] N tex field(s) not rendered at build time, e.g. … (the source is shown as text)")` (1.13.0 showed the source as text only when KaTeX was missing).
- Known differences from 1.13.0, all inside formulas and only through `tex`, as egatari-spec 56ae5da documents (§6.2: colours come only from classes and the theme): the colour of `\color` and `\textcolor`, the background and frame colour of `\colorbox` and `\fcolorbox`, `\pmb`'s shadow, and KaTeX's error colour for untrusted commands are dropped and reported; use `\hlE` `\hlT` `\hlM` (classes, spec §8.0), which are kept. Phantoms (`color: transparent`), boxes and their borders are kept. KaTeX writes `class=""` on some spans and an `<svg>`'s style as text when it draws in the page (1.13.0), and neither when it renders to markup: the identity test compares these as equal (`KATEX_EMPTY_CLASS`, `KATEX_SVG_STYLE`, approved in egatari-spec 56ae5da). The `\htmlClass` `\htmlId` `\htmlData` commands of spec §8.0 now work (1.13.0 drew them as errors: no trust at play time).
- An unknown `loop` value and an edge to an unknown node are reported with `ctx.report("data", "[flow] …")` (1.13.0: `console.warn` and `console.error`).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- The v1.13.0 demo has formulas; no fixture.
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
