# m-venn changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "venn", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-venn"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` / `previewOpacity`;
  `static partName = "venn"`. The embedded `egatari-variant` block is gone (`base.variant`). The DOM is byte-identical to
  1.13.0 on its demo at every step, up to the id rewrite below (tools/test-c2-identity.mjs).
- Ids: its clip paths are `venn-2-0-0-<n>-in<i>` and `venn-2-0-0-<n>-out<i>` (1.13.0: `m-venn-<n>-in<i>`, `-out<i>`),
  numbered by a counter of the part's own (1.13.0: the class's static `n`, which a frozen class cannot carry).
  Rewrite in the identity test: `m-venn-\d+` → `venn-2-0-0-\d+`.
- Items that do not fit their regions even at 24 px are reported with `ctx.report("size", "[venn] …")` (1.13.0:
  `console.warn("m-venn: …")`). Regions with C in a two-set diagram still throw; base contains it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Kept from 1.11: the shape geometry is written again at the end of every render (the raster fix,
  tools/test-raster-history.mjs).

## 1.13.0

As released in the library's 1.13.0.
