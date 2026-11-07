# m-codetree changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.4 (components 2.4.1)

- On a short element the tree window shows fewer levels (down to 2) so that levels are at least 40 px apart and the 0/1 labels stay off the edges (was 24 px, crowded at about 380 px high).

## 2.0.3 (components 2.3.0)

- The element's text equivalent (aria-label, shown by print and screen readers) says ハフマン木 / Huffman tree, matching the display name (#168).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Display name ハフマン木 / Huffman tree (was 文脈木 / Context tree): the part draws Modified Huffman decoding, and "context tree" reads as CTW (#168). The tag stays m-codetree.
- Fix: the codeword labels (白 3, 黒 30 …) are placed by base's measured textWidth (digits were 0.6 em, so neighbouring labels could touch).

## 2.0.1 (components 2.1.2)

- Fix: in window mode the summary step drew only the deepest codeword path (the other paths had opacity 0), although the summary promises all decoded paths; the summary now lays out the whole tree of all decoded paths without the window when its levels are at least 20 px apart, and otherwise keeps the deepest-path window and reports `layout`.
- Fix: the fade at the edges of the tree window still applied at t = Infinity, so nodes and labels at the window edge stayed half-faded in the final (printed) state; at t = Infinity they are now either drawn solid or not at all.
- Fix: a tree window whose levels are less than 24 px apart (a short element) drew squeezed levels silently; it now reports `layout` with the spacing and asks for a taller element or fewer levels at a time.
- Fix: the element had no role, so assistive tech read the bits and tree labels in DOM order and ignored an aria-label on the element; it is now role="img" (the svg aria-hidden) named by the final state (the bits and the decoded runs, then "done" or the error), and an author aria-label is kept.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

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
