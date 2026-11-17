---
name: contour-core
version: 1.0.0
kind: library
summary: 格子の上の値から等高線を引く計算（マーチング・スクエア）。m-classify2d と m-contour が使う。教材の作者が直接は書かない
---

A library part (Egatari spec §6.1): it defines no element. `m-classify2d` 2.0.0 requires it as
`requires: {"contour-core": "1.0.0"}`; `tools/test-contour-core.mjs` tests it without a browser. It requires nothing, touches
no DOM and keeps no state. The values come from the author's script (for example `predict_proba` or `decision_function` over a
meshgrid); this part only finds where a level crosses them.

```js
const K = deps["contour-core"];
K.lines(values, 0.5);   // polylines [[x, y], …] in grid units (x = column, y = row), joined across cells
K.segments(values, 0);  // the raw crossing segments, one or two per cell; saddles split by the cell mean
K.labelAt(line);        // {x, y, angle, length}: the middle of a polyline, for a level label
K.rangeOf(values);      // [min, max] of the finite values
```
