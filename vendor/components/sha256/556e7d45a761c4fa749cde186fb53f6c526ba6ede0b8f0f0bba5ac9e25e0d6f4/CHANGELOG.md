# m-kanbun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).

## 2.0.1 (components 2.1.2)

- Fix: in the final 書き下し文 state the return arcs faded to 0 and the order numbers to 40 %, so prints and the script view lost the reading order; the arcs and numbers now stay as they were at the end of the order steps.
- Fix: two-digit order numbers were shrunk to 18.5px at size 60; they now stay at 24px and are narrowed horizontally to fit the number box (down to 75 %, which covers size 54 and up; smaller sizes still shrink the font).
- Fix: an aria-label the author put on the element was overwritten, and the generated name mentioned the 書き下し文 even when phases left it out; the author label is now kept, the generated name (漢文：… 。書き下し文：…) follows the phases, and the characters, numbers and arcs inside the role="img" are aria-hidden so they are not read a second time.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

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
