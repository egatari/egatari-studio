# m-boxplot changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "boxplot", version: "2.0.0", requires: {base: "1.0.0", "boxplot-core": "1.0.0",
  plot: "1.0.0"}, element: "m-boxplot"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` /
  `previewOpacity` and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "boxplot"`. The DOM is byte-identical to
  1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- The quartiles (1.13.0: the class's `static stats`) moved, unchanged, to the library part `boxplot-core` 1.0.0, which tests
  read (tools/test-stats.mjs). The class has no `stats` any more.
- Reports (1.13.0: `console.warn("m-boxplot: …")`), from `mount`: `build` and `orient` values it cannot use as
  `ctx.report("attr", "[boxplot] …")`; `outliers="on"` with a group written as `five` as `ctx.report("data", …)`; an element
  too small or too narrow as `ctx.report("size", …)`; no free place for a value's name as `ctx.report("layout", …)`. Data
  that fits the shape but not the rules still throws (base contains it).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (1.13.0: `DECK.ja`). Variants through `base.variant` (the copied
  `egatari-variant` block is gone); the preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
