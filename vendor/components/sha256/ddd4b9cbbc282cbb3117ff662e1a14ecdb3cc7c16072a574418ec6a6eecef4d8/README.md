---
name: code-core
version: 1.0.0
kind: library
requires: base@1.2.0
summary: m-code と m-trace のコードの描き方（等幅の幅、色の役割、説明の折り返し、長い行の折り返し、ステップごとにスクロールする表示）。教材の作者が直接は書かない
---

A library part (Egatari spec §6.1): it defines no element. `m-code` 2.2.0 requires it as `requires: {"code-core": "1.0.0"}`, and
`m-trace` will. It keeps no state and creates no DOM. `wrap` measures prose with `base.textWidth`.

The first eight functions were moved verbatim from m-code 2.1.0, so m-code draws the same pixels when its 2.1.0 layout fits.

```js
const C = deps["code-core"];
C.lines("a\r\nb");                 // ["a", "b"]
C.monoWidth("x = 1", 24);          // px at .6em per Latin character, 1em for wide characters
C.cut(s, width, fs);               // s, or s cut with … to fit
C.spans(program, "python");        // per line [[start, end, "term" | "accent2" | "muted"], …]: keywords, strings, comments
C.wrap(prose, width, fs, element); // prose rows (words where possible)
C.softWrap(line, width, fs);       // [{from, to}] visual rows of one code line: after a space, comma or opening bracket
C.windowFor(n, slots, ra, rb);     // {f, l, top, bottom, fits}: rows f..l shown; "⋮" markers above / below
```
