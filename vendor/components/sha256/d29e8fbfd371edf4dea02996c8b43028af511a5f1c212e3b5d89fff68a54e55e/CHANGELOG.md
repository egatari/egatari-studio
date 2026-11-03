# m-curves changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "curves", version: "2.0.0", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"},
  element: "m-curves"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `previewOpacity` and
  `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "curves"`. The DOM is byte-identical to 1.13.0 on its demo at every
  step, but for the ids below (tools/test-c2-identity.mjs).
- The expressions `f` are compiled by the `expr` library part (`deps.expr.compile`); the copied `egatari-expr` block is gone.
  A refused expression throws in `mount` as before, and base contains it (one `ctx.report`, the placeholder).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids (spec §6.1 Identifiers): the masks of dashed lines are `curves-2-0-0-<n>m<i>`, numbered by this part's own counter
  (1.13.0: `mc<n>m<i>`, numbered by advancing `DECK.Plot.n`, so the plots' clip ids also skipped a number). The axes' clip
  path is plot's `plot-1-0-0-clip<n>` (1.13.0: `clip<n>`).

## 1.13.0

As released in the library's 1.13.0.
