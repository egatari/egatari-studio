---
summary: Plane vectors and 2 × 2 matrices step by step: ops, linear maps, eigenvectors, bases; formulas beside
steps: vectors → each op → matrix → basis
props:
  dur: s per step
  size: text px
example: {"range":[-4,4,-3,3],"vectors":[{"id":"a","v":[2,1],"label":"*a*"},{"id":"b","v":[-1,2],"label":"*b*"}],"ops":[{"sum":["a","b"],"as":"c","label":"*a* + *b*"},{"dot":["a","b"],"value":0}]}
---

`vectors` (`id`, `v`, `label`), `ops`: `sum`, `diff`, `scale` (`["a", 2]`), `proj`, `dot`; `as` names a result; `value` is checked. Or `matrix` or `basis`.
<!-- llm: omit -->
- `range` [xmin, xmax, ymin, ymax]; equal units.
- `show`: `eigen` (eigenvector spans), `unit` (default; the unit square), `det`. Complex eigenvalues report data.
- Colours: vectors term, the step's result emph, helpers muted dashed, the mapped grid and new basis accent2.
- No preview of later steps.
<!-- llm: end -->

Demo: `demo.html`.

<!-- llm: omit -->
Notes

- 2-D only.
- The formula panel's lines are limited by the height; extra lines report layout.
<!-- llm: end -->
