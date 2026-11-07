# m-sweep changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.1 (components 2.4.2)

- Requires plot 1.1.1: the y-axis title no longer overlaps wide tick labels such as 1000 or 50000 (it moves left of them, widening the margin if needed).
- Grey-line names sit just above or below a line, never on one (the owner asked for labels off lines); a name that cannot avoid every line is reported (layout).

## 2.1.0 (components 2.4.1)

- `point`: a dot on the curve at a fixed `u`, with a label whose `{y}` shows the current value; it follows the curve as the parameter changes. A value outside `yr` hides it and is reported.
- `at`: start seconds per change (values − 1, increasing). With it, every change plays in step 1 at its second (for music or narration); `cues(1)` returns them. Overlapping changes are reported.
- `size`: text size (≥ 24 px) for ticks, axis titles, line names and the point label; margins follow. Requires plot 1.1.0.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: the ghost-curve labels (σ = 0.5) are placed by base's measured textWidth in the deck's font (0.6 em before).

## 2.0.1 (components 2.1.2)

- Fix: a NaN or ±Infinity value of `f` (for example `log(u)` for u ≤ 0, or a division by zero at one value) put NaN into the path and the whole line disappeared. The part now builds the path itself, breaking it at non-finite samples (finite runs as separate subpaths), with one `data` report per parameter value.
- Fix: in the final state the grey curves of the earlier values had no label, so a print could not tell which value each curve had. Each grey curve now carries its value (for example "σ = 0.5") in `var(--muted)` at 24 px, on the curve with a background halo, placed away from the other curves, the current value and each other; with more than four grey curves only the first and the last are labelled. A label shows while its curve is shown grey.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "sweep", version: "2.0.0", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"},
  element: "m-sweep"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `lerp` / `previewOpacity` and
  `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "sweep"`. The DOM is byte-identical to 1.13.0 on its demo at every
  step (tools/test-c2-identity.mjs).
- The expression `f` is compiled by the `expr` library part (`deps.expr.compile`); the copied `egatari-expr` block is gone.
  A refused expression throws in `mount` as before, and base contains it (one `ctx.report`, the placeholder).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: the axes' clip path is plot's `plot-1-0-0-clip<n>` (1.13.0: DECK.Plot's `clip<n>`); the part writes none of its own.

## 1.13.0

As released in the library's 1.13.0.
