# m-boxplot changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.4.1)

- Requires plot 1.1.0 (no drawing change; only the clip id prefix differs).
- An element with no room (e.g. 0 px high) still reports "size" but no longer draws negative heights (console errors in the quality check).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: label widths use base's measured textWidth in the deck's font (its own estimate took digits and Latin letters as 0.56–0.6 em, about 25–35 % too narrow in BIZ UDPGothic, so long numbers and Latin labels overflowed silently). Group labels, value labels and tick spacing follow it.

## 2.0.1 (components 2.1.2)

- Fix: quartiles and other written values were rounded to one decimal more than the data without a ≈ (n = 10: inc 6.25 showed as 6.3, exc 5.75 and 12.25 as 5.8 and 12.3), disagreeing with the README table; without digits they are now written exactly (6.25), never with fewer decimals than the data.
- Fix: an unknown method (e.g. method="tukey") threw in boxplot-core and the whole figure became an error placeholder; it is now reported (attr) and jp is used.
- Fix: the element had no role, so assistive tech read every tick and label in the svg in DOM order; it is now role="img" (the svg aria-hidden) named by each group's five-number summary (and its outliers with outliers="on"), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "boxplot", version: "2.0.0", requires: {base: "1.0.0", "boxplot-core": "1.0.0",
  plot: "1.0.0"}, element: "m-boxplot"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant` /
  `previewOpacity` and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "boxplot"`. The DOM is byte-identical to
  1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- The quartiles (1.13.0: the class's `static stats`) moved, unchanged, to the library part `boxplot-core` 1.0.0, which tests
  read (tools/test-stats.mjs). The class has no `stats` any more.
- Reports (1.13.0: `console.warn("m-boxplot: …")`), from `mount`: `build` and `orient` values it cannot use as
  `ctx.report("attr", "[boxplot] …")`; `outliers="on"` with a group written as `five` as `ctx.report("data", …)`; an element
  too small or too narrow as `ctx.report("size", …)`; no free place for a value's name as `ctx.report("layout", …)`. Data
  that fits the shape but not the rules still throws (base contains it).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` (1.13.0: `DECK.ja`). Variants through `base.variant` (the copied
  `egatari-variant` block is gone); the preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
