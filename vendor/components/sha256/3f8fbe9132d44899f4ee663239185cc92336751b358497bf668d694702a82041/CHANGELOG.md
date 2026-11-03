# m-menu changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.1.2)

- Fix: a printed menu did not say where its cards lead (print only hid the visited mark); in print each card now shows the target slide's number ("→12", from ctx.slides) at its top right, where the visited mark is on screen, so the cards keep their height and a full menu still fits the slide (cards to another file keep their bottom-right mark).
- Fix: the visited mark (top right) and the another-file mark (bottom right) were drawn over long titles; cards that can show a mark now keep room for it on the right, and a long word wraps inside the card instead of overflowing it (overflow-wrap). The style element is now `menu-2-0-1-css` (its CSS changed).
- Fix: the element had no role, so assistive tech read the cards as loose text in DOM order; it is now role="navigation" named by its card titles in one sentence, and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

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
