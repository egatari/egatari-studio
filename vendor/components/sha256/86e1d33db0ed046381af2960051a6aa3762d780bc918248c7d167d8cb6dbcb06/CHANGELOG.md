# m-scatter changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.4.1)

- Requires plot 1.1.0 (no drawing change; only the clip id prefix differs).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: label widths use base's measured textWidth in the deck's font (its own estimate took digits and Latin letters as 0.56–0.6 em, about 25–35 % too narrow in BIZ UDPGothic, so long numbers and Latin labels overflowed silently). The y-tick margin, point labels and series labels follow it (6-digit y ticks were cut at the left).

## 2.0.1 (components 2.1.2)

- Fix: points outside xr / yr were drawn outside the axes or off the slide; they are now left out and reported as `data`.
- Fix: a malformed xr / yr (one number, reversed, or not numbers) or an r that is not a positive number broke the plot silently; it is now reported as `attr`, and the automatic range or the default radius 9 is used.
- Fix: the element had no role or accessible name, and screen readers read the raw svg text; it now has role="img" and an aria-label that states the final state in one sentence (axes, the number of points drawn, their ranges, named points and the direction of each trend line). An author's aria-label is kept, and the svg is aria-hidden.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "scatter", version: "2.0.0", requires: {base: "1.0.0", plot: "1.0.0"}, element:
  "m-scatter"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `variant` / `previewOpacity`
  and `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "scatter"`. The DOM is byte-identical to 1.13.0 on its demo at
  every step (tools/test-c2-identity.mjs).
- Reports (1.13.0: `console.warn("m-scatter: …")`): a point's name with no free place, `ctx.report("layout", "[scatter] …")`;
  a trend line outside the axes, `ctx.report("range", …)`; the names above the figure wider than the figure,
  `ctx.report("size", …)`. A wrong `trend` still throws in `mount`, and base contains it.
- Variants through `base.variant` (the copied `egatari-variant` block is gone); the preview view is `ctx.preview` alone
  (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
