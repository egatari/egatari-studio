---
name: shape
version: 1.0.0
kind: library
summary: 2.0 のパーツのデータの形（static shape）を確かめる小さな検査器。base が使う。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1 "Data shapes": a part checks its own
data against its declared shape and reports a mismatch with `ctx.report`; players do not validate component data). It
requires nothing and touches no DOM; `base` requires it, and `base.MotionElement` uses it before mount.

```js
shape.check(schema, value)   // → null | {path, why, expected, got, key?, near?, n?, parent?}
shape.describe(schema, depth?), shape.brief(schema), shape.gotOf(value), shape.typeOf(value), shape.near(key, names), shape.dataLike(message)
```

Schemas are a small subset of JSON Schema (`type`, `items`, `minItems`, `maxItems`, `properties`, `required`, `anyOf`
of `required` sets, `enum`, `additionalProperties: false`), as written at the top of `index.js`. The code is Egatari
Studio's `kit/shape.js` (MIT, the same owner; see NOTICE), unchanged but for the wrapper; `tools/test-part-shape.mjs`
compares every function with the pinned Studio's `DECK.shape`, text for text.
