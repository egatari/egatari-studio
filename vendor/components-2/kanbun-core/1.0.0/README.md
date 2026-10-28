---
name: kanbun-core
version: 1.0.0
kind: library
summary: 漢文の読み取り（白文・返り点・送り仮名・振り仮名）と訓読の順・書き下し文の計算。m-kanbun が使う。教材の作者が直接は書かない
---

**2.0 alpha (branch `c2-base`; not for lessons).** A library part (Egatari spec §6.1): it defines no element and requires
nothing. `m-kanbun` 2.0.0 requires it as `{"kanbun-core": "1.0.0"}`. Pure functions on strings and arrays (no DOM):

```js
parse(src)                  // → {chars, cols, warnings}: one line per column; (送り仮名) [返り点] {振り仮名|=かな|-} 字-字 、。
order(chars)                // → {units, events, warnings}: the reading order (返り点, 再読文字, 置き字)
charEvents(o)               // → [{c, kind, ev}]: the order per character (kind "read" | "first" | "second")
kakikudashi(chars, o)       // → [[{t, rb}]]: the lines of the 書き下し文
stepGroups(chars, ce, by)   // → [{a, b}]: m-kanbun's order steps (by "col": one per run in one column; "all": one)
hira(s)                     // katakana → hiragana
yomi(src)                   // the 書き下し文 as a string (lines joined with "\n")
```

The rules of the reading order are in [m-kanbun's README](../kanbun/README.md). The code is m-kanbun 1.13.0's (where it
was `DECK.kanbun`), unchanged but for the wrapper. Tests: `tools/test-kokugo.mjs` loads it through the registry shim
(「春暁」「春望」、『史記』『論語』『荀子』など).
