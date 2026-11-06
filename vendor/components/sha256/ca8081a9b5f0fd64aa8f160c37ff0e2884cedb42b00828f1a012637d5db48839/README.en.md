---
summary: Lines drawn one at a time on shared axes, each named at its end (no legend)
steps: largest step (default: number of series)
props:
  xr: x range
  yr: y range
  xt: x ticks
  yt: y ticks
  xf: x tick decimals
  yf: y tick decimals
  xl: x title
  yl: y title
  n: samples
  dur: draw seconds
  lw: line width
example: [{"label": "Demand D", "f": "10 - x"}, {"label": "Supply S", "f": "2 + x"}, {"label": "Equilibrium", "pts": [[4, 0], [4, 6]], "dash": true}]
---

One comparison at a time in one figure: mean, median, quantiles; losses one by one.

Series: a JSON array in a child script. One series = one step; same `step` = together.

| Field | Meaning |
|---|---|
| `label` | line name |
| `f` | expression in x (see below) |
| `pts` | points `[[x, y], …]` |
| `tone` | `term` `emph` `accent2` `muted` `fg` `series-1..4` |
| `dash` | dashed |
| `labelAt` / `anchor` / `dx` / `dy` / `ly` | name at x = `labelAt` (default: end); `anchor` `right` `left` `above` `below`; `ly` = y |

`f` is arithmetic, not code: numbers, `x`, `Math` functions/constants (`sin(x)`, `PI`; no `random`), `N(x, mean, sd)`, `+ - * / % **`, comparisons, `&& || !`, `? :`. Powers: `**`. An unreadable `f` shows a card.

<!-- llm: omit -->
Older forms (still work; not described to the AI)

- `color` = `tone`; `at` = `labelAt` (only without `labelAt`)
- `anchor` `start` `middle` `end`: raw text-anchor
- Without `step`, series i is step i + 1. Lecture view shows later lines at `--preview-opacity`
- The demo is `demo.html`. Series fields match `m-scatter` (conventions §3)
<!-- llm: end -->
