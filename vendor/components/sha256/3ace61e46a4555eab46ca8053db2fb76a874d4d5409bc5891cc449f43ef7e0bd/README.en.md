---
summary: Scatter plot; point series by step, then a trend line (least squares or 2 points)
steps: series + trend (default 1 series = 1 step, lines 1 step)
props:
  xr: x range
  yr: y range
  xt: x ticks
  yt: y ticks
  xf: x tick decimals
  yf: y tick decimals
  xl: x title
  yl: y title
  r: point radius px
  dur: step seconds
example: {"series": [{"label": "Sunny", "points": [[24, 210], [28, 380], [31, 560], {"x": 34, "y": 690, "label": "Heatwave"}]}], "trend": "linear"}
---

Relation of two quantities (heat vs sales). Points, then trend.

Child JSON: `{"series": [...], "trend": ...}`.

- series: `points` (`[x, y]` or `{"x", "y", "label", "anchor", "tone"}`), `label` (series name, top with marker), `tone` (`term` `emph` `accent2` `muted` `fg` `series-1..4`), `step` (1 series = 1 step; same = together), `at` (start s)
  - Point `label` placed clear of overlaps (`anchor` = first try: `right` `left` `above` `below`); outliers only
  - Marker shape per series; repeats after 4, so ≤ 4 series
- trend: `"linear"` (least squares on all points), or `{"fit": "linear", "series": 0, "label", "tone", "dash", "step", "at", "digits"}`, or `{"pts": [[x0, y0], [x1, y1]]}` (segment; exactly 2 points; vertical OK); several = array
  - `series`: fitted series index from 0, or array (default all)
  - `label`: `{r}` correlation, `{a}` slope, `{b}` intercept (`digits`, default 2), e.g. `"Trend (r = {r})"`
  - `step`: default after the last series
  - Clipped to the plot; lines outside reported. Vertical `pts`: `{a}` `{b}` empty; `{r}` only for fits
- Axes: `xr` `yr` range, `xt` `yt` ticks, `xf` `yf` decimals, `xl` `yl` titles; range/ticks auto if omitted
- `variant`: `fade` (default), `sweep` (left to right), `grow` (points grow, line from the middle)
- Show later steps faintly (`ctx.preview`): later points and lines faint

The demo is `demo.html`. All numbers are fictional.

<!-- llm: omit -->
Notes

- Marker shapes: circle, square, triangle, diamond (colour not relied on); repeat after 4. Point labels try right → left → above → below
- Fits span the fitted x range, `pts` the 2 points
- Step length `dur` (default 1 s): points in 0.7 s, then point and series names; line names after the line is drawn
- `sweep` only orders points; `grow` only scales them; nothing moves (conventions §1.2). No rise-from-below variant: it would move more than variant 0
- Text width estimated from characters; no room for a name is reported (`ctx.report`)
<!-- llm: end -->
