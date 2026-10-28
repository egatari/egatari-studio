---
name: heatmap-core
version: 1.0.0
kind: library
summary: m-heatmap の計算（行ごとの割合、色の範囲と混ぜる割合、セルの字の色と縁、名前の間引きとセルの大きさ、段階）。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element.
`m-heatmap` 2.0.0 requires it as `requires: {"heatmap-core": "1.0.0"}`; `tools/test-heatmap.mjs` tests it without a
browser. It requires nothing, touches no DOM and keeps no state. Moved from m-heatmap 1.13.0, where it was the class's
`static calc`, unchanged except that `layout`'s `notes` no longer start with `m-heatmap: ` (m-heatmap reports them with its
own prefix).

```js
const C = deps["heatmap-core"];
C.normalizeRows([[45, 3, 2], [6, 38, 6]]);       // each row sums to 1 (a zero row stays 0)
const d = C.domain(values, "sequential", 0, null); // {lo, hi, c}; "diverging" is symmetric around the center
C.frac(v, "sequential", d);                        // 0…1 (diverging: −1…1), clamped
C.pick(toneRGB, bgRGB, fgRGB, p);                  // {p, text: "fg" | "bg", halo}: a mix whose number reaches 4.5:1
C.layout({W, H, rows, cols, legend, xl, yl, rotate}); // {cs, fs, orient, kr, kc, gx, gy, gw, gh, x0, top, …, notes}
C.steps(nr, nc, build, highlight);                 // {cell: [[k]], hl: [{r, c, st}], steps}
```

Also `clean`, `mix` and `contrast` / `lum` (OKLab mixing and WCAG contrast of sRGB triples), `est` (text width estimate),
`shown` (the thinned label indices) and `numberSize` (the cells' number size, 0 when 24 px does not fit).
