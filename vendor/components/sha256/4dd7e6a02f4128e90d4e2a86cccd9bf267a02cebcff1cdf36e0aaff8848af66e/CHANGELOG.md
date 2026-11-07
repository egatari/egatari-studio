# m-quad changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: point, axis and quadrant name widths use base's measured textWidth in the deck's font (0.58–0.6 em before), so the placer avoids the real text.

## 2.0.2 (components 2.1.2)

- Fix: after a `to` move the final state lost where the point started (the dashed trail had no start mark or direction), so a print did not read as a move; the start point now keeps a hollow dot in the point colour and the trail ends in an arrowhead just before the point.
- Fix: the element had no role, so assistive tech read the axis words and labels in DOM order and ignored an aria-label on the element; it is now role="img" (the svg aria-hidden) with a one-sentence name of the final state (axes, and each point's quadrant, from where to where for a move), and an author aria-label is kept.

## 2.0.1 (components 2.0.0)

- Text kept clear (#140): a quadrant name goes to the first of its quadrant's four corners (the outer one first, as before) that no point, point name or axis-end word touches; when none is free it stays in the outer corner and point names that touch it move (`ctx.report("layout", …)` when one cannot). The demos draw as in 2.0.0 (tools/test-c2-identity.mjs, tools/test-overlap.mjs).

## 2.0.0 (components 2.0.0-rc.1)

- Moved to `egatariParts.define({name: "quad", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-quad"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `lerp` / `clamp` / `previewOpacity`; `static partName = "quad"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
