# m-map-japan changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "map-japan", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-map-japan"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "map-japan"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/map-japan.html` (the inset redraw,
  `layout="true"`, small elements, reported cases) at every step (tools/test-c2-identity.mjs).
- The map data (`map-japan-data`, from Natural Earth 5.1.1, public domain, with its credit lines) is byte-for-byte as in
  1.13.0.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Drawing moved from `mount(ctx, retry)` to `draw(ctx, retry)`, called by `mount(ctx)`: the redraw without the 小笠原諸島
  inset calls `draw` again (in 2.0 the instance's `mount` is base's contained wrapper, which takes only `ctx`).
- Reports (1.13.0: `console.warn("m-map-japan: …")`, same English text, now `[map-japan] …`):
  `ctx.report("attr", …)` for a `layout`, `islands` or `show` value it does not know; `ctx.report("data", …)` for more
  than 5 classes, a value below the first class, and a point, arrow or shape in the 小笠原諸島 area that is not drawn;
  `ctx.report("size", …)` for a label with no room or overlapping another, the inset left out for lack of room and pieces
  dropped from a small element; `ctx.report("theme", …)` when the theme's colours give classes too close in lightness.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
