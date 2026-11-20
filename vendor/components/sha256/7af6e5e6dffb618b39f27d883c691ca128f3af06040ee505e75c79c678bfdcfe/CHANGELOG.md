# m-scroll changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.17.0)

- New in the library: a tall figure in a frame of fixed height, scrolled to the child marked `data-scroll-step="k"` at step k. Made by a student of the lab as an embedded part (scroll 0.1.0) and taken in (handoff #66). Changes from 0.1.0: steps are the largest `data-scroll-step` (0.1.0 declared 1, so only step 1 moved), `static viewerInput`, ctx.entered and ctx.reset give the frame back to the steps, video ignores scroll events, print shows the author's place, the frame has a `--line` border and a focus ring, and the readable name falls back to the lesson language.
