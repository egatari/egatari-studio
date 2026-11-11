# m-predict changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.5 (components 2.6.2)

- The answer-step doc is shorter in English (`2 or more (default 2); after the step-1 count`) so the English pack text is not longer than the Japanese (Studio's check); the Japanese says ステップ (the glossary term) instead of 段階.

## 2.0.4 (components 2.6.1)

- The answer-step doc (in the AI instructions) says 2 or more (default 2): the answer opens after step 1, where the class counts (it said 1 was allowed, so AIs chose 1 and the counts opened together with ✓ 正解). A value of 1 still works as before.

## 2.0.3 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: choice labels, the count column and the ✓ after each count use base's measured textWidth in the deck's font (0.56 em before, so a large count ran into ✓ 正解).

## 2.0.2 (components 2.1.2)

- Fix: in an element narrower than about 590 px the bar axis got a negative length, so the bars vanished and the ticks piled up, silently; it is now reported (size), the axis keeps at least 120 px and the ticks are spaced so their numbers do not overlap.
- Fix: counts above 9999 were accepted and drawn, then the first +1 clamped them to 9999; they are now reported (data) at mount and shown as 9999 from the start, the most the −1/+1 buttons and the field take. Style id predict-2-0-2-css.

## 2.0.1 (components 2.0.0)

- `layout(ctx)` (spec §8.4 Layout): at a new laid-out size the part redraws its picture and controls at that size, keeping the viewer's counts and prediction, and puts focus back on the rebuilt control in the same row and place (a field keeps its caret). Same size or a box of size 0: nothing changes (tools/test-layout.mjs).

## 2.0.0 (components 2.0.0-rc.1)

- Moved to `egatariParts.define({name: "predict", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-predict"})`,
  extending `base.MotionElement` with `base.el` / `mtext` / `prog` / `variant`; `static partName = "predict"`.
  The DOM is byte-identical to 1.13.0 on its demo at every step (tools/test-c2-identity.mjs).
- Viewer input (spec §8.4): the counts and the learner's prediction are reset only on the render where `ctx.entered` is
  true; `ctx.reset` still only blurs a focused field or button. The `deck:pos` listener (1.13.0's fallback for players
  without `ctx.entered`) is gone.
- `render(k, t, ctx)` handles `ctx.entered` / `ctx.reset` and then draws with `paint(k, t, {mode, preview, live})`; a
  redraw after viewer input (buttons, field, `input()`, prediction, print) calls `paint` with the last (k, t), so it never
  goes through the player's or base's `render` again (1.13.0 called `render` with a reduced ctx).
- Video: `ctx.mode === "video"` read in `mount` (1.13.0: `DECK.mode`), also for `input()`.
- Print: `beforeprint` / `afterprint` on `document.defaultView` (1.13.0: `window`).
- Reports: rows too low for the buttons and a question, label or note that does not fit at 24 px are
  `ctx.report("size", "[predict] …")` (1.13.0: `console.warn("m-predict: …")`). An ignored `input(choice, count)` stays a
  `console.warn`, now `[predict] input(…) ignored …` (a developer's call, not the lesson's data).
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Ids: its style element is `predict-2-0-0-css` (1.13.0: `m-predict-css`); it is in `<head>`, not in the component's DOM,
  so no id rewrite is needed in the identity test.

## 1.13.0

As released in the library's 1.13.0.
