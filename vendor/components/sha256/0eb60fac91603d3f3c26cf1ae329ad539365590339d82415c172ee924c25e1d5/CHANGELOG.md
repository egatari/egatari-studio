# m-kobun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.1.2)

- Fix: with `tate`, the element took Studio's `.tate` layout rule (vertical writing, height 100%) and was 0 wide, so an auxiliary's card opened off the slide. The part now uses its own class `kb-tate`; the `tate` attribute is unchanged.
- Fix: 接頭 and 接尾 were shown as 接 (接続詞); the longest matching name wins. An unknown part of speech is now reported, as 2.0.0's changelog said.
- Fix: the element had no role, so its aria-label was ignored; it is now role="figure" (not img, so the auxiliary-verb buttons stay reachable) named by the parsed text and, when shown, the translation; an author aria-label is kept, and the translation is aria-hidden when yaku="false" hides it.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

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
