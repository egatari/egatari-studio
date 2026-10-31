# m-seq changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "seq", version: "2.0.0", requires: {base: "1.0.0", plot: "1.0.0"}, element: "m-seq"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity` and `plot.Plot` (1.13.0:
  `DECK.Plot`); `static partName = "seq"`. The DOM is byte-identical to 1.13.0 on its demo at every step
  (tools/test-c2-identity.mjs).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
