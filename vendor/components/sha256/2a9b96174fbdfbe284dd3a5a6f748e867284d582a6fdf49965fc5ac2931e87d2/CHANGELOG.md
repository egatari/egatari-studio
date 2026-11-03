# m-tape changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.1.2)

- Fix: the element had no role, so assistive tech read the labels in the svg in DOM order without saying which row or brace they belong to; it is now role="img" (the svg aria-hidden) named by the final state built from the data (「テープ図：A 12 m、B 12 m＋5 m、B 全体 □ m」: each row's segments, each brace, each times arrow), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "tape", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-tape"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` / `previewOpacity`; `static partName = "tape"`.
  The embedded `egatari-variant` block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo at every
  step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-tape: …")`): problems with the data or attributes (`unknown` not "?" or "□", a brace
  or times that does not fit the rows, brace `side`, `build`, `kind`) are `ctx.report("data", "[tape] …")`; an element too
  small, `ctx.report("size", "[tape] …")`. A segment whose `v` is not positive still throws; base contains it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
