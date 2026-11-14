# m-seq changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.5 (components 2.7.0)

- Requires base 1.2.0 and plot 1.1.2 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.4 (components 2.4.2)

- Requires plot 1.1.1: the y-axis title no longer overlaps wide tick labels such as 1000 or 50000 (it moves left of them, widening the margin if needed).

## 2.0.3 (components 2.4.1)

- Requires plot 1.1.0 (no drawing change; only the clip id prefix differs).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: the ghost-curve labels (n = 3) are placed by base's measured textWidth in the deck's font (0.6 em before).

## 2.0.1 (components 2.1.2)

- Fix: a NaN, ±Infinity or missing value in `dens` put NaN into the path, and the whole curve (and its fill) disappeared. The curve and its fill are now drawn per finite run, and one `data` report lists the steps.
- Fix: when a readout name was missing from one update, the panel showed "undefined", and the next step an unformatted number. The last value is now kept, formatted with its digits, and one `data` report lists the names and steps.
- Fix: in the final state the grey curves of earlier steps were unlabelled, so a print could not tell which n each was. The grey curves now carry "n = …" (the readout value of a name written n, such as `*n*`, else the number of updates) in `var(--muted)` at 24 px, on the curve with a background halo, avoiding the other curves, the observation mark and its name; with more than four grey curves only the first and the last are labelled.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "seq", version: "2.0.0", requires: {base: "1.0.0", plot: "1.0.0"}, element: "m-seq"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity` and `plot.Plot` (1.13.0:
  `DECK.Plot`); `static partName = "seq"`. The DOM is byte-identical to 1.13.0 on its demo at every step
  (tools/test-c2-identity.mjs).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
