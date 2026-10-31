# m-pie changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "pie", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-pie"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` / `previewOpacity`; `static partName = "pie"`.
  The embedded `egatari-variant` block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo at every
  step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-pie: …")`): a negative value, `ctx.report("data", "[pie] …")`; labels outside that do
  not fit the height, a label wider than the space beside the pie, and a center text wider than the hole,
  `ctx.report("size", "[pie] …")`. Values that add up to 0 still throw; base contains it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
