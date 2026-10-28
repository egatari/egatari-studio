---
name: plot
version: 1.0.0
kind: library
summary: 2.0 のパーツが使う座標軸つきの図（軸・目盛り・軸の名前・切り抜き）。教材の作者が直接は書かない
requires: base@1.0.0
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1). Parts that draw on axes (today
`m-boxplot`, `m-curves`, `m-hist`, `m-scatter`, `m-seq`, `m-sweep` through `DECK.Plot`) require it as
`requires: {base: "1.0.0", plot: "1.0.0"}` and receive `{Plot}`:

```js
const p = plot.Plot(box, {xr: [0, 10], yr: [0, 1], xt: [0, 5, 10], yt: [0, 0.5, 1], xf: 0, yf: 1, xl: "x", yl: "y"});
// p = {svg, W, H, m, x(v), y(v), clip, d(f, a, b, n), poly(pts)}
```

`Plot` is Egatari Studio's `DECK.Plot` from `kit/deck.js` (MIT, the same owner; see NOTICE), drawing with base's `el`
and `mtext`; `tools/test-part-plot.mjs` compares it with the pinned Studio's `DECK.Plot`. One deliberate difference: the
clip path ids carry this part's name and version, dots replaced (`plot-1-0-0-clip1`, `plot-1-0-0-clip2`, … where
`DECK.Plot` writes `clip1`, `clip2`, …), so that they are unique across parts and part versions in one file (spec §6.1
Identifiers). They are numbered by this copy's own counter (`Plot.n`): deterministic, no randomness or timing.
