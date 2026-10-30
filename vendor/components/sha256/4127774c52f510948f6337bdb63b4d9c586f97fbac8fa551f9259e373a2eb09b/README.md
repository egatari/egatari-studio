---
name: hist-core
version: 1.0.0
kind: library
summary: m-hist の代表値と度数の計算（平均値・中央値・最頻値、階級への数え上げ、度数分布表からの代表値）。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element. `m-hist`
2.0.0 requires it as `requires: {"hist-core": "1.0.0"}`; `tools/test-stats.mjs` tests it without a browser. It requires
nothing, touches no DOM and keeps no state. Moved verbatim from m-hist 1.13.0, where it was the class's `static stats`.

```js
const S = deps["hist-core"];
S.mean([3, 5, 7]);                 // 5
S.median([3, 5, 6, 7]);            // 5.5 (the mean of the middle two)
S.modes([1, 2, 2, 3]);             // [2]; [] when every value appears once (2 or more values)
S.counts(values, start, width, nb) // counts per class: start + i·width 以上、start + (i+1)·width 未満
S.tableMedian(start, width, counts) // {bin, from, to, x} the median class, or {at, x} a class boundary
```

Also `sorted`, `sum`, `binOf`, `mids` (class values), `tableMean`, `binModes`, `cumulative` and `clean` (rounds away
floating-point noise, 10 decimals).
