---
name: boxplot-core
version: 1.0.0
kind: library
summary: m-boxplot の四分位数の計算（中央値、教科書の求め方 jp と表計算の inc・exc の四分位数、1.5×四分位範囲の外れ値）。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element.
`m-boxplot` 2.0.0 requires it as `requires: {"boxplot-core": "1.0.0"}`; `tools/test-stats.mjs` tests it without a browser.
It requires nothing, touches no DOM and keeps no state. Moved verbatim from m-boxplot 1.13.0, where it was the class's
`static stats`.

```js
const S = deps["boxplot-core"];
const q = S.quartiles([3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 18], "jp");
// {n, sorted, min, q1, med, q3, max, iq1, imed, iq3, halves}: jp (default; the median of each half, leaving out the
// median when n is odd — 中2・数学Ⅰ), "inc" / "exc" (QUARTILE.INC / QUARTILE.EXC; exc needs 3 or more values)
S.fences(q, values);   // {lo, hi, wlo, whi, out}: 1.5 × IQR fences, whisker ends inside them, the outliers
```

Also `sorted`, `at` (the value at a position between sorted values), `median` and `clean` (rounds away floating-point
noise, 10 decimals). A group without values, an unknown method and `exc` with fewer than 3 values throw.
