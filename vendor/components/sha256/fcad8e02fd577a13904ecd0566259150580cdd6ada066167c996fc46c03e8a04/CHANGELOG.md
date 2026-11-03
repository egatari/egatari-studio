# m-market changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.1.2)

- Fix: with `scale="area"`, values that were zero, negative, or not strictly decreasing from the outer ring gave NaN radii or rings larger than the element (over the slide title). Such data is now reported (`data`) and the figure falls back to the fixed spacing.
- Fix: the first ring started its entrance at 1.15 times its radius and was briefly drawn outside the element (over the slide title). The starting radius is now capped so the ring stays inside the element.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "market", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-market"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity`; `static partName = "market"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Reports: none (1.13.0 wrote no warnings). Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
