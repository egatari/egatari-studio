# m-hist changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "hist", version: "2.0.0", requires: {base: "1.0.0", "hist-core": "1.0.0", plot:
  "1.0.0"}, element: "m-hist"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` /
  `previewOpacity` and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "hist"`. The DOM is byte-identical to 1.13.0
  on its demo at every step (tools/test-c2-identity.mjs).
- The statistics (1.13.0: the class's `static stats`) moved, unchanged, to the library part `hist-core` 1.0.0, which tests
  read (tools/test-stats.mjs). The class has no `stats` any more.
- Reports (1.13.0: `console.warn("m-hist: …")`), from `mount`: attribute values it cannot use (`kind`, `style="dots"`,
  `marks`, `build`, polygon / relative / cumulative with dots) as `ctx.report("attr", "[hist] …")`; no bins written, no mode,
  a second series without a label as `ctx.report("data", …)`; an element too small, dots too small as
  `ctx.report("size", …)`; no free place for a mark's name as `ctx.report("layout", …)`. Data that fits the shape but not
  the rules still throws (base contains it).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (1.13.0: `DECK.ja`). Variants through `base.variant` (the copied
  `egatari-variant` block is gone); the preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
