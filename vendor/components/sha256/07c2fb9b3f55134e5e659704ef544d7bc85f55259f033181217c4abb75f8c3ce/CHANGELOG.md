# m-hist changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.4.1)

- Requires plot 1.1.0 (no drawing change; only the clip id prefix differs).
- An element with no room (e.g. 0 px high) still reports "size" but no longer draws negative heights (console errors in the quality check).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: label widths use base's measured textWidth in the deck's font (its own estimate took digits and Latin letters as 0.56–0.6 em, about 25–35 % too narrow in BIZ UDPGothic, so long numbers and Latin labels overflowed silently). Tick spacing, flags and series labels follow it.

## 2.0.1 (components 2.1.2)

- Fix: a negative count in a frequency table was accepted silently and went into the total, the mean, the median and the relative frequencies; it is now reported (data) and counted as 0.
- Fix: relative frequencies rounded inconsistently because toFixed rounds the binary value (0.175 showed as 0.17 but 0.875 as 0.88); they now round half up in decimal (0.18, 0.88).
- Fix: the element had no role, so assistive tech read every tick and number in the svg in DOM order; it is now role="img" (the svg aria-hidden) named by the count of each class (or of each value for a dot plot without bins), the relative or cumulative value when shown, and the marks, and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "hist", version: "2.0.0", requires: {base: "1.0.0", "hist-core": "1.0.0", plot:
  "1.0.0"}, element: "m-hist"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` /
  `previewOpacity` and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "hist"`. The DOM is byte-identical to 1.13.0
  on its demo at every step (tools/test-c2-identity.mjs).
- The statistics (1.13.0: the class's `static stats`) moved, unchanged, to the library part `hist-core` 1.0.0, which tests
  read (tools/test-stats.mjs). The class has no `stats` any more.
- Reports (1.13.0: `console.warn("m-hist: …")`), from `mount`: attribute values it cannot use (`kind`, `style="dots"`,
  `marks`, `build`, polygon / relative / cumulative with dots) as `ctx.report("attr", "[hist] …")`; no bins written, no mode,
  a second series without a label as `ctx.report("data", …)`; an element too small, dots too small as
  `ctx.report("size", …)`; no free place for a mark's name as `ctx.report("layout", …)`. Data that fits the shape but not
  the rules still throws (base contains it).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (1.13.0: `DECK.ja`). Variants through `base.variant` (the copied
  `egatari-variant` block is gone); the preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
