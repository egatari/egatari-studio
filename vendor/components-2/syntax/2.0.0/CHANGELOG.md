# m-syntax changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "syntax", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-syntax"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "syntax"`.
  The embedded egatari-variant block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/syntax.html` at every
  step (tools/test-c2-identity.mjs).
- Reports instead of `console.warn("m-syntax: …")`: writing errors `ctx.report("data", "[syntax] …")`, `build` other than
  steps / whole `ctx.report("attr", …)`, `size` below 27 `ctx.report("range", …)` (all from `mount`), and an arrow across
  lines or an element too low `ctx.report("size", …)` (from `render`, once, after the fonts have loaded, as in 1.13.0).
  The messages are the same.
- The reader and the steps for tests are `static testing = {parse, plan, durationOf, POS, KIND}` on the class, read
  through the registry or `partClass` (1.13.0: `DECK.syntax`); no part reads it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: its style element is `syntax-2-0-0-css` (1.13.0: `m-syntax-css`); it is in `<head>`, not in the component's DOM,
  so no id rewrite is needed in the identity test.

## 1.13.0

As released in the library's 1.13.0.
