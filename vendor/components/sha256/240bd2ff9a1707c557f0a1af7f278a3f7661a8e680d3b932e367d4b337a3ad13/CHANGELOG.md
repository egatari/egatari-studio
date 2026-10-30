# m-kpi changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "kpi", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-kpi"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `clamp` / `previewOpacity`;
  `static partName = "kpi"`. The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Variants: `base.variant(this)` (names from `static variants`) instead of the embedded `egatari-variant` block.
- `DECK.ease(x)` (the flip variant's settling digit) is `base.prog(x, 0, 1)`, the same function.
- The note that `count="false"` shows a counting variant as `rise` stays a `console.info`, now prefixed `[kpi]`
  (1.13.0: `m-kpi:`); it is not a problem with the lesson, so it is not a `ctx.report`.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
