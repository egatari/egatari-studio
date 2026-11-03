# m-curves changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate) and plot 1.0.1.
- Fix: line-label widths use base's measured textWidth in the deck's font (Latin was 15 px at 26 px, about 0.58 em).
- Fix: a line label with a superscript is kept inside the top of the plot and one with a subscript above the tick labels, and stacked labels keep apart by what the 24px sub- and superscripts of base 1.1.0 reach; labels without them are placed as before.

## 2.0.1 (components 2.1.2)

- Fix: a sample of `f` that is NaN or ±Infinity (for example `log(x)` at 0, `1/(x-2)` at 2) put NaN into the path, and the whole line disappeared. The finite runs are now drawn as separate subpaths, the name sits on the last finite point, and a `data` report names the series once.
- Fix: an unknown `tone` (for example "emphasis") gave `var(--emphasis)` and an invisible line. The line now falls back to its default colour (series-1..4 in order) with an `attr` report; `var(--…)` and the theme names (term, emph, accent2, muted, fg, line, series-1..4) work as before.
- Fix: line names were separated using their unclamped height but drawn at `Math.max(26, y)`, so names near the top overlapped. Heights are now clamped first (top 26 px, bottom 6 px above the x axis, so names no longer run into the tick labels), then separated, pushing back upwards from the bottom when needed.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "curves", version: "2.0.0", requires: {base: "1.0.0", expr: "1.0.0", plot: "1.0.0"},
  element: "m-curves"})`, extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `previewOpacity` and
  `plot.Plot` (1.13.0: `DECK.Plot`); `static partName = "curves"`. The DOM is byte-identical to 1.13.0 on its demo at every
  step, but for the ids below (tools/test-c2-identity.mjs).
- The expressions `f` are compiled by the `expr` library part (`deps.expr.compile`); the copied `egatari-expr` block is gone.
  A refused expression throws in `mount` as before, and base contains it (one `ctx.report`, the placeholder).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids (spec §6.1 Identifiers): the masks of dashed lines are `curves-2-0-0-<n>m<i>`, numbered by this part's own counter
  (1.13.0: `mc<n>m<i>`, numbered by advancing `DECK.Plot.n`, so the plots' clip ids also skipped a number). The axes' clip
  path is plot's `plot-1-0-0-clip<n>` (1.13.0: `clip<n>`).

## 1.13.0

As released in the library's 1.13.0.
