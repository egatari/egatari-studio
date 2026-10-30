# m-gendai changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "gendai", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-gendai"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `previewOpacity`; `static partName = "gendai"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Writing errors in the text (a paragraph or anchor that does not exist, an unknown mark, an unclosed or nested mark) are
  reported with `ctx.report("data", "[gendai] …")` from `mount` (1.13.0: `console.warn("m-gendai: …")`).
- The reader for tests is `static testing = {parse}` on the class, read through the registry (1.13.0: `DECK.gendai`);
  no part reads it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
