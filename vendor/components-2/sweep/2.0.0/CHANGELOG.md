# m-sweep changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "sweep", version: "2.0.0", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"},
  element: "m-sweep"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity` and
  `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "sweep"`. The DOM is byte-identical to 1.13.0 on its demo at every
  step (tools/test-c2-identity.mjs).
- The expression `f` is compiled by the `expr` library part (`deps.expr.compile`); the copied `egatari-expr` block is gone.
  A refused expression throws in `mount` as before, and base contains it (one `ctx.report`, the placeholder).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
