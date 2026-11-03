# m-bars changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: label widths use base's measured textWidth in the deck's font (its own estimate took digits and Latin letters as 0.56–0.6 em, about 25–35 % too narrow in BIZ UDPGothic, so long numbers and Latin labels overflowed silently). Margins for group, series and tick labels follow it, and a segment value inside a stacked bar is shown only when its measured width fits (the separate 100 % stack estimate is gone).

## 2.0.1 (components 2.1.2)

- Fix: the element had no role, so assistive tech read the tick labels and values in DOM order and ignored an aria-label on the element; it is now role="img" (the svg aria-hidden) named by the final values in one sentence (axis or series name and unit, then each group's values; stacked bars add the total, percent stacks give %), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "bars", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-bars"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity`; `static partName = "bars"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- An element too small for the bars is reported with `ctx.report("size", "[bars] …")` (1.13.0: `console.warn("m-bars: …")`).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0 (negative values, `stack="percent"`).
