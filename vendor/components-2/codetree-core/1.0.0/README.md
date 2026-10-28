---
name: codetree-core
version: 1.0.0
kind: library
summary: 符号表から符号の木を作り、2 値の系列を復号する（ファクシミリの MH 符号：白と黒のランを交互に読む）。m-codetree が使う。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element and requires
nothing. `m-codetree` 2.0.0 requires it as `{"codetree-core": "1.0.0"}`. Pure functions (no DOM):

```js
normalize(table)       // → {white: [{code, run}], black: […]}; table [{run, white, black}] or {"white": {"符号": ラン}, "black": {…}}
build(table)           // → {white: tree, black: tree}: a node {code, kids: [0 の子, 1 の子], leaf: {run, kind} | null}
decode(trees, bits)    // → {bits, tokens: [{code, start, end, color, run, kind}], error, next}: white first; after a terminating
                       //   code the other colour, after a make-up code (run ≥ 64) the same, after "EOL" white;
                       //   error null or {kind: invalid | incomplete | dangling, start, pos, color, code}
runs(tokens)           // → [{color, toks, start, len}]: the decoded pixel runs (make-up + terminating joined; EOL separates)
```

The code is m-codetree 1.13.0's (where it was `DECK.codetree`), unchanged but for the wrapper. Tests:
`tools/test-codetree.mjs` loads it through the registry shim (the ITU-T T.4 MH codes of m-codetree's demo).
