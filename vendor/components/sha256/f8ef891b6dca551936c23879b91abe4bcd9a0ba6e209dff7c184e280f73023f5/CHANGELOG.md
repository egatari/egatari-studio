# m-keyboard changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "keyboard", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-keyboard"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "keyboard"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/keyboard.html` (an English lesson:
  default `abc` names; `iroha`, `rise`, `cumulative`) at every step (tools/test-c2-identity.mjs).
- Steps never depend on the context (spec §8.4): the default key names (`solfa` for a Japanese lesson, else `abc`) are
  chosen in `mount` from `/^ja\b/i.test(ctx.lang)` (1.13.0: in `plan()`, from `DECK.ja`). `plan()` no longer carries
  `names`; the step count, durations and sound events never depended on them.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Reports: a step `tone` that is not a theme colour is `ctx.report("data", "[keyboard] …")`; an element too small for the
  keys, white keys too narrow for their names, overlapping black-key names and a step label wider than the element are
  `ctx.report("size", "[keyboard] …")` (1.13.0: `console.warn("m-keyboard: …")`). Range and key errors still throw
  (base contains them and reports `[keyboard] steps: …` / `mount: …`).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- `static kb` (the keyboard geometry and names, read by tools/test-keyboard.mjs through `partClass`) is unchanged.
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
