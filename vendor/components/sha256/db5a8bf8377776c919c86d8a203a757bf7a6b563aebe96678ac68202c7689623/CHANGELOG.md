# m-map-japan changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.4.4)

- In an English lesson (ctx.lang not ja) the built-in names are English: Takeshima, Senkaku Islands, Okinotorishima, Minamitorishima, Chichijima, Iwo To, and the inset captions Nansei Islands / Ogasawara Islands (different scale). The Japanese names overflowed their label boxes in the English font. Japanese lessons draw the same as before.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: legend, caption and chip widths use base's measured textWidth in the deck's font (0.6 em before, with a second, wider 0.72 em pass for the legend, which is gone: the legend is placed once with 4 px of room). In a small element the 南西諸島 caption or the legend can now fit where it was dropped before.

## 2.0.1 (components 2.1.2)

- Fix: in a dark theme the value classes collapsed (the lightest class was set below the darkest). When --bg is darker than --fg the lightness ramp now runs the other way, from just above the background and the land colour up toward --fg, so the classes stay apart; the light theme is unchanged.
- Fix: one unknown prefecture key in `values` or `regions`, an unknown region group, a value that is not a number, or `classes` that do not increase threw, and the whole map became a placeholder. Each is now reported (`data`) and skipped (classes fall back to the quartiles), and the rest is drawn.
- Fix: the host had an aria-label but no role, so the name was never exposed. It now has role="figure" (its readable paragraph stays readable).

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "map-japan", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-map-japan"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "map-japan"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/map-japan.html` (the inset redraw,
  `layout="true"`, small elements, reported cases) at every step (tools/test-c2-identity.mjs).
- The map data (`map-japan-data`, from Natural Earth 5.1.1, public domain, with its credit lines) is byte-for-byte as in
  1.13.0.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Drawing moved from `mount(ctx, retry)` to `draw(ctx, retry)`, called by `mount(ctx)`: the redraw without the 小笠原諸島
  inset calls `draw` again (in 2.0 the instance's `mount` is base's contained wrapper, which takes only `ctx`).
- Reports (1.13.0: `console.warn("m-map-japan: …")`, same English text, now `[map-japan] …`):
  `ctx.report("attr", …)` for a `layout`, `islands` or `show` value it does not know; `ctx.report("data", …)` for more
  than 5 classes, a value below the first class, and a point, arrow or shape in the 小笠原諸島 area that is not drawn;
  `ctx.report("size", …)` for a label with no room or overlapping another, the inset left out for lack of room and pieces
  dropped from a small element; `ctx.report("theme", …)` when the theme's colours give classes too close in lightness.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
