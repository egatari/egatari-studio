# m-gendai changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).

## 2.0.1 (components 2.1.2)

- Fix: the element had no role, so its aria-label (the whole passage) was ignored and the line and frame labels in the svg were read as loose text; it is now role="figure" whose name sums up the final reading marks (underlines, what each demonstrative points to, paragraph roles and links, for the phases shown), the passage stays readable as its content, the svgs are aria-hidden, and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

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
