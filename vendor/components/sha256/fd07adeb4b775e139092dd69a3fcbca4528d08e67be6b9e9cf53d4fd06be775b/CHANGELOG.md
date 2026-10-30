# m-heatmap changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "heatmap", version: "2.0.0", requires: {base: "1.0.0", "heatmap-core": "1.0.0"},
  element: "m-heatmap"})`, extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`;
  `static partName = "heatmap"`. The DOM is byte-identical to 1.13.0 on its demo at every step, but for the id below
  (tools/test-c2-identity.mjs).
- The calculations (1.13.0: the class's `static calc`) moved to the library part `heatmap-core` 1.0.0, which tests read
  (tools/test-heatmap.mjs); `layout`'s notes there no longer start with `m-heatmap: `. The class has no `calc` any more.
- Reports (1.13.0: `console.warn("m-heatmap: …")`), from `mount`: attribute values it cannot use (`normalize`, `scale`,
  `build`, `show`, `tone`, `lowtone`, `numbers`, `diag`, tone = lowtone in a diverging scale) as
  `ctx.report("attr", "[heatmap] …")`; a highlight outside the grid, a row summing to 0 as `ctx.report("data", …)`; thinned
  labels, an element too small, numbers turned off (more than 12×12, cells too small) as `ctx.report("size", …)`. The
  English messages are unchanged. Data that fits the shape but not the rules still throws (base contains it).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (1.13.0: `DECK.ja`). Variants through `base.variant` (the copied
  `egatari-variant` block is gone); the preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids (spec §6.1 Identifiers): the legend's gradient is `heatmap-2-0-0-legend-<n>`, numbered by this part's own counter
  (1.13.0: `m-heatmap-legend-<n>`).

## 1.13.0

As released in the library's 1.13.0.
