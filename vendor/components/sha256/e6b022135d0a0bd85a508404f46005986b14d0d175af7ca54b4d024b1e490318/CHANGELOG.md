# m-codetree changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "codetree", version: "2.0.0", requires: {base: "1.0.0", "codetree-core": "1.0.0"},
  element: "m-codetree"})`, extending `base.MotionElement` with `base.el` / `prog` / `lerp` / `previewOpacity`;
  `static partName = "codetree"`. The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/codetree.html` at every step
  (tools/test-c2-identity.mjs).
- The code tables, code trees and decoding moved to the library part `codetree-core` 1.0.0 (1.13.0: `DECK.codetree`, which
  no longer exists); the code is unchanged.
- The part's code now runs in strict mode (1.13.0's had no `"use strict"`).
- `DECK.clamp01` → `base.clamp`.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
