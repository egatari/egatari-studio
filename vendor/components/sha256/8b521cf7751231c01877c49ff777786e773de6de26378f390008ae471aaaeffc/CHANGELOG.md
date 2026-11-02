# m-timer changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.0.0)

- `layout(ctx)` (spec §8.4 Layout): at a new laid-out size the part redraws its picture at that size; the ±1 min buttons are moved, not rebuilt, so focus and the extension are kept. Same size or a box of size 0: nothing changes (tools/test-layout.mjs).

## 2.0.0 (components 2.0.0-rc.1)

- Moved to `egatariParts.define({name: "timer", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-timer"})`,
  extending `base.MotionElement` with `base.el` / `prog`; `static partName = "timer"`. The DOM is byte-identical to 1.13.0
  on its demo and on `tools/fixtures/c2-identity/timer.html` (the demo as an English lesson) at every step
  (tools/test-c2-identity.mjs).
- Viewer input (spec §8.4): the extension (`ctx.extend`, ±1 min) is cleared only on the render where `ctx.entered` is true;
  `ctx.reset` still only blurs a focused button. The `deck:pos` listener (1.13.0's fallback for players without
  `ctx.entered`) is gone. Bells (`events(k)`) are unchanged.
- `render(k, t, ctx)` handles `ctx.entered` / `ctx.reset`, keeps the ctx without them and draws with `paint(k, t, ctx)`; a
  redraw after viewer input (±1 min, print) calls `paint` with the last (k, t), so it never goes through the player's or
  base's `render` again (1.13.0 called `render` with the kept ctx).
- Language: `/^ja\b/i.test(ctx.lang)`, read in `mount` and kept as `this.ja` (1.13.0: `DECK.ja`), for the built-in
  strings, the phase list and the durations ("1分30秒" / "1 min 30 s"). Video: `ctx.mode === "video"` (1.13.0: `DECK.mode`).
- Print: `beforeprint` / `afterprint` on `document.defaultView` (1.13.0: `window`).
- Reports: a title or a phase-list entry that does not fit at 24 px, a text longer than 2 lines, an element too low for the
  clock and too many phases for the list are `ctx.report("size", "[timer] …")` (1.13.0: `console.warn("m-timer: …")`).
- Ids: its style element is `timer-2-0-0-css` (1.13.0: `m-timer-css`); it is in `<head>`, not in the component's DOM, so
  no id rewrite is needed in the identity test.

## 1.13.0

As released in the library's 1.13.0.
