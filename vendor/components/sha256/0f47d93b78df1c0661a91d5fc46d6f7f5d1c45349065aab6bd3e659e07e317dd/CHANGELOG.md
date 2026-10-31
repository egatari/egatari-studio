# m-kobun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "kobun", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-kobun"})`,
  extending `base.MotionElement` with `base.prog` / `previewOpacity`; `static partName = "kobun"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Writing errors (an unknown part of speech or auxiliary verb, …) are reported with `ctx.report("data", "[kobun] …")`
  from `mount` (1.13.0: `console.warn("m-kobun: …")`).
- The auxiliary verb's card: closed when the step changes or on `ctx.reset` (as in 1.13.0); it does not open in video,
  read from `ctx.mode` in `mount` (1.13.0: `DECK.mode` at the click). A click redraws with the last render's ctx, without
  `reset` and `entered`.
- The reader and the tables for tests are `static testing = {parse, AUX, FORMS, auxOf, posOf}` on the class, read through
  the registry (1.13.0: `DECK.kobun`); no part reads it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: its style element is `kobun-2-0-0-css` (1.13.0: `m-kobun-css`); it is in `<head>`, not in the component's DOM, so
  no id rewrite is needed in the identity test.

## 1.13.0

As released in the library's 1.13.0.
