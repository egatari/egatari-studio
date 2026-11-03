# m-menu changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "menu", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-menu"})`,
  extending `base.MotionElement`; `static partName = "menu"`. The DOM is byte-identical to 1.13.0 on its demo and on
  `tools/fixtures/c2-identity/menu.html` at every step and after visiting every slide (tools/test-c2-identity.mjs).
- Reads its cards' fragments itself (spec §9.1A: `#<key>`, `#<key>:<stepKey>`, legacy `#N`) against `ctx.slides`
  (`[{key, title, steps, concl}]`): a numbered step key above the slide's `steps`, and `#<key>:concl` on a slide without
  a conclusion (`concl` false), are refused, as `DECK.resolveFragment` did.
- "Visited" marks: `ctx.visited(key)`, refreshed on the render where `ctx.entered` is true (1.13.0 listened to DECK's
  `deck:pos`). Language: `/^ja\b/i.test(ctx.lang)` (1.13.0: `DECK.ja`).
- Ids: its style element is `menu-2-0-0-css` (1.13.0: `m-menu-css`); it is in `<head>`, not in the component's DOM, so no
  id rewrite is needed in the identity test.

## 1.13.0

As released in the library's 1.13.0.
