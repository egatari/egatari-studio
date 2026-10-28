---
name: expr
version: 1.0.0
kind: library
summary: 2.0 のパーツが属性やデータに書かれた式を計算するための、算術だけの安全な式の評価器（コードとしては動かさない）。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element. A part that
evaluates expressions written in its attributes or data requires it as `requires: {expr: "1.0.0"}` (Egatari spec §6:
such parts MUST restrict what the expressions can do) and receives

```js
expr.compile(src, {name, vars: ["u", "c"], funcs: {N: fn}, bareMath})   // → function(v0, v1, …), or throws SyntaxError
expr.FUNCS, expr.CONSTS, expr.MAX_LEN, expr.MAX_DEPTH
```

The code between the `BEGIN/END egatari-expr` lines is `tools/expr.js`, kept equal by `tools/expr-sync.mjs`; what it
accepts and refuses is written at its top and tested by `tools/test-expr.mjs`. The 1.x parts `m-sweep` and `m-curves`
still carry their own copy until they move to 2.0.
