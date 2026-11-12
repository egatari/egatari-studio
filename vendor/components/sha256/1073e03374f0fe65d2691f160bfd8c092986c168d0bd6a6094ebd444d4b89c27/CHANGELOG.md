# m-numberline changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: label widths use base's measured textWidth in the deck's font (its own estimate took digits and Latin letters as 0.56–0.6 em, about 25–35 % too narrow in BIZ UDPGothic, so long numbers and Latin labels overflowed silently). Tick thinning, margins and the placement of marks, jumps and ranges follow it (6- and 7-digit tick labels could touch).

## 2.0.1 (components 2.1.2)

- Fix: the element had no role, so assistive tech read every tick label in the svg in DOM order; it is now role="img" (the svg aria-hidden) named by the final state built from the data (「数直線 0〜10：3 に印、3→7 に +4」: the lines, then each mark, jump, range, link and magnified part), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "numberline", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-numberline"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` / `previewOpacity`;
  `static partName = "numberline"`. The embedded `egatari-variant` block is gone (`base.variant`). The DOM is
  byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-numberline: …")`): problems with the data or attributes (a line, mark or jump that
  does not exist or lies outside its line, link with one line, magnify with two lines or outside its line, unknown build
  names, lines not aligned at 0, `labels` values, a box mark on a magnified line) are
  `ctx.report("data", "[numberline] …")`; an `arrow` value other than on/off, `ctx.report("attr", …)`; an element too small, `ctx.report("size", "[numberline] …")`. Values that are
  not numbers and other refused data still throw; base contains them.
- The geometry used by tools/test-numberline.mjs is `static testing = {geom}` (1.13.0: `static geom`); no part reads it.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Kept from 1.11: the shape geometry is written again at the end of every render (the raster fix,
  tools/test-raster-history.mjs).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
