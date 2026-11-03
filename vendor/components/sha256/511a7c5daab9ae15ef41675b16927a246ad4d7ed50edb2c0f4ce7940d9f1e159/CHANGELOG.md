# m-hissan changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.1.2)

- Fix: a product past 2^53 (e.g. 123456789×987654321, up to the 12 × 12 digits the parser accepts) was computed as a Number and came out wrong in its last digits, or as NaN; the 「たす」 caption could show an exponent. Both are now exact (BigInt for the product, the partial products written with their zeros).
- Fix: the accessible name was every svg text in DOM order, including hidden ones such as the rejected 仮の商 and the small carries; the element is now role="img" (the svg aria-hidden) named by the final result (「筆算：851 ÷ 23 = 37」, with あまり when there is a remainder and ≒ for a quotient stopped before it ends), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "hissan", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-hissan"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant`; `static partName = "hissan"`. The embedded
  egatari-variant block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo at every step
  (tools/test-c2-identity.mjs).
- Reports instead of `console.warn("m-hissan: …")`, all from `mount` with the 1.13.0 messages: attribute values it does
  not take (`build`, `per`, `carry`, options for another operation, `kari` with nothing to correct)
  `ctx.report("attr", "[hissan] …")`, `digits` outside 0–8 `ctx.report("range", …)`, and a calculation that does not fit
  (a decimal quotient that does not end within the height, an element too narrow or too low) `ctx.report("size", …)`.
  `plan()`, which gives the step count, still reads only the attributes and collects these notes for `mount`.
- Expressions it cannot calculate (`expr="12+"`, a negative difference, division by zero, a number that is not one or has
  more than 12 digits) still throw; base contains the exception and reports it once as `ctx.report("error", "[hissan]
  steps: …")`. The thrown messages lost their own `m-hissan: ` prefix (1.13.0), so the part is named once.
- `static calc` (the calculation and layout, no DOM) stays on the class; tools/test-hissan.mjs reads it through `partClass`.
- The part's code now runs in strict mode as a whole (1.13.0: only its calculation).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
