# m-map-world changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "map-world", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-map-world"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "map-world"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/map-world.html` (reported cases,
  the graticule, small elements) at every step (tools/test-c2-identity.mjs).
- The map data (`map-world-data`, from Natural Earth 5.1.1, Japan's point of view, public domain, with its credit lines)
  is byte-for-byte as in 1.13.0.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Reports (1.13.0: collected and written at the end of `mount` as `console.warn("m-map-world: …")`; still collected and
  sent at the same point, same English text, now `ctx.report(code, "[map-world] …")`): `attr` for a `grid`, `labels` or
  `show` value it does not know; `data` for more than 5 classes or 4 categories, XUD (帰属未定地) in values or regions, a
  value below the first class, a country with no shape at this scale, and a flow whose short way crosses the seam (30°W);
  `size` for a label or the legend with no room; `theme` when the theme's colours give classes too close in lightness.
- A local `base` in `mount` (the land paths, never read) is renamed `landPath`, so that it does not hide the base part.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
