# m-collect changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "collect", version: "2.0.0", requires: {base: "1.0.0", "markup-reader": "1.0.0"}, element: "m-collect"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity`; `static partName = "collect"`.
  The DOM is byte-identical to 1.13.0 at every step (tools/test-c2-identity.mjs, with the formulas rendered at build time on the 2.0 side).
- Formulas are rendered at build time (Egatari spec §6.2), no longer by KaTeX at play time: `static build = {fields: {"targets[].tex": "katex"}, options: {katex: {output: "html"}}}`. The producer adds `texHtml` beside each `tex` and `renderers: {katex: {version, options}}` at the top of the data (the shape now allows both). The part reads `texHtml` through `markup-reader` 1.0.0 (exactly the elements, attributes and style declarations of egatari-spec's `schema/rendered-markup-1.json`; anything else is dropped, an element with its subtree, an attribute or style declaration by itself, and reported at the end of mount once per kind with its count as `ctx.report("data", "[collect] …")`) into the same frame 1.13.0 drew (`foreignObject.smath` with an inline-block `div`), so the formula's DOM is that of 1.13.0's.
- Without `texHtml` (a file built without the renderer, or after a tier A edit of a `tex`) the `tex` source is shown as plain text in the same frame and reported once with the count: `ctx.report("data", "[collect] N tex field(s) not rendered at build time, e.g. … (the source is shown as text)")` (1.13.0 showed the source as text only when KaTeX was missing).
- Known differences from 1.13.0, all inside formulas and only through `tex`, as egatari-spec 56ae5da documents (§6.2: colours come only from classes and the theme): the colour of `\color` and `\textcolor`, the background and frame colour of `\colorbox` and `\fcolorbox`, `\pmb`'s shadow, and KaTeX's error colour for untrusted commands are dropped and reported; use `\hlE` `\hlT` `\hlM` (classes, spec §8.0), which are kept. Phantoms (`color: transparent`), boxes and their borders are kept. KaTeX writes `class=""` on some spans and an `<svg>`'s style as text when it draws in the page (1.13.0), and neither when it renders to markup: the identity test compares these as equal (`KATEX_EMPTY_CLASS`, `KATEX_SVG_STYLE`, approved in egatari-spec 56ae5da). The `\htmlClass` `\htmlId` `\htmlData` commands of spec §8.0 now work (1.13.0 drew them as errors: no trust at play time).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- The v1.13.0 demo computed its targets (with their `tex`) in a page script at play time, so there was nothing to render at build time; the demo now writes the same data (same numbers) in the source. `tools/fixtures/c2-identity/collect.html` (that demo) replaces the v1.13.0 demo in the identity test (`c2-identity-replaces-demo`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
