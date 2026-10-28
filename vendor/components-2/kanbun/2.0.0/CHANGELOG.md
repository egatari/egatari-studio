# m-kanbun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "kanbun", version: "2.0.0", requires: {base: "1.0.0", "kanbun-core": "1.0.0"},
  element: "m-kanbun"})`, extending `base.MotionElement` with `base.prog` / `lerp` / `previewOpacity`;
  `static partName = "kanbun"`. The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- The reading (parse), the reading order, the 書き下し文 and the order steps moved to the library part `kanbun-core` 1.0.0
  (1.13.0: `DECK.kanbun`, which no longer exists); the code is unchanged.
- Writing errors (a missing `{=ず}`, a 返り点 without its target, …) are reported with `ctx.report("data", "[kanbun] …")`, and
  text that does not fit the element even at size 42 with `ctx.report("size", "[kanbun] …")`, both from `mount` (1.13.0:
  `console.warn("m-kanbun: …")`; the messages are the same).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
