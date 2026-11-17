---
summary: Contours of f(x, y) by level, gradient arrows, a descent path by point
steps: levels (all: 1) → gradient → path points
props:
  dur: s per step
  size: text px
  by: level or all
example: {"f":"x**2 + 3*y**2","range":{"x":[-3,3],"y":[-2,2]},"levels":[1,2,4,8],"gradient":{"at":[[1,1]]},"path":[[2.5,1.5],[1.5,0.3],[0.9,0.06]],"monotone":true}
---

`f` (arithmetic in x, y) or a script's `grid`; `levels` (≤8), `gradient.at`, `path` from a script. Size: with `equal` and a square range, about 740 px wide for 440 px high (a panel on the right); to fill the width, widen x or set `equal: false`.
<!-- llm: omit -->
- `range` {x, y}; `equal` (default true). `grid.values` row 0 = min y.
- Level labels on the lines. `gradient`: `scale`, `tangent`. `path` ≤30 points; `monotone` reports a rise.
- Colours: contours term, gradient accent2, path fg, current point emph. No preview of later steps.
<!-- llm: end -->

Demo: `demo.html`.

<!-- llm: omit -->
Notes

- A formula f is sampled on 97 × 73; pass narrow valleys as `grid`.
<!-- llm: end -->
