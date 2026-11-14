# m-kpi changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: the number, unit and change line are centred by base's measured textWidth in the deck's font (digits were 0.58 em, so long numbers sat off centre).

## 2.0.1 (components 2.1.2)

- Fix: the element had no role, so assistive tech read the card texts in DOM order and ignored an aria-label on the element; it is now role="img" (the svg aria-hidden) named by each card's final value in one sentence (label, value and unit, then the change and note), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "kpi", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-kpi"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `clamp` / `previewOpacity`;
  `static partName = "kpi"`. The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Variants: `base.variant(this)` (names from `static variants`) instead of the embedded `egatari-variant` block.
- `DECK.ease(x)` (the flip variant's settling digit) is `base.prog(x, 0, 1)`, the same function.
- The note that `count="false"` shows a counting variant as `rise` stays a `console.info`, now prefixed `[kpi]`
  (1.13.0: `m-kpi:`); it is not a problem with the lesson, so it is not a `ctx.report`.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
