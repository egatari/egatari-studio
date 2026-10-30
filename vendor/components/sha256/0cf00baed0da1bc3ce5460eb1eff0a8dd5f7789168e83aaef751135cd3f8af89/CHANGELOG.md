# m-compare changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "compare", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-compare"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` / `previewOpacity`;
  `static partName = "compare"`. The embedded `egatari-variant` block is gone (`base.variant`). The DOM is byte-identical
  to 1.13.0 on its demo and on `tools/fixtures/c2-identity/compare.html` (an English lesson) at every step
  (tools/test-c2-identity.mjs).
- Language: the default heading of the difference column ("違い" / "Difference") follows `/^ja\b/i.test(ctx.lang)`,
  read in `mount` (1.13.0: `DECK.ja`).
- A table that does not fit even at 24 px is reported with `ctx.report("size", "[compare] …")` (1.13.0:
  `console.warn("m-compare: …")`). The checks of `values` and `better` still throw; base contains them.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
