# m-numberline changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "numberline", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-numberline"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` / `previewOpacity`;
  `static partName = "numberline"`. The embedded `egatari-variant` block is gone (`base.variant`). The DOM is
  byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-numberline: …")`): problems with the data or attributes (a line, mark or jump that
  does not exist or lies outside its line, link with one line, magnify with two lines or outside its line, unknown build
  names, lines not aligned at 0, `labels` values, a box mark on a magnified line) are
  `ctx.report("data", "[numberline] …")`; an `arrow` value other than on/off, `ctx.report("attr", …)`; an element too small, `ctx.report("size", "[numberline] …")`. Values that are
  not numbers and other refused data still throw; base contains them.
- The geometry used by tools/test-numberline.mjs is `static testing = {geom}` (1.13.0: `static geom`); no part reads it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Kept from 1.11: the shape geometry is written again at the end of every render (the raster fix,
  tools/test-raster-history.mjs).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
