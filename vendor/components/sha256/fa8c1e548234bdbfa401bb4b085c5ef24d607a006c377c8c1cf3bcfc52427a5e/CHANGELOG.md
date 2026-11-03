# m-scatter changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "scatter", version: "2.0.0", requires: {base: "1.0.0", plot: "1.0.0"}, element:
  "m-scatter"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` / `previewOpacity`
  and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "scatter"`. The DOM is byte-identical to 1.13.0 on its demo at
  every step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-scatter: …")`): a point's name with no free place, `ctx.report("layout", "[scatter] …")`;
  a trend line outside the axes, `ctx.report("range", …)`; the names above the figure wider than the figure,
  `ctx.report("size", …)`. A wrong `trend` still throws in `mount`, and base contains it.
- Variants through `base.variant` (the copied `egatari-variant` block is gone); the preview view is `ctx.preview` alone
  (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
