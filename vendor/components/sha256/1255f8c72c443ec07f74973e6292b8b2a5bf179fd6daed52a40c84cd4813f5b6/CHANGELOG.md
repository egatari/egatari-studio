# m-cards changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.1.0)

- New part: 2–6 cards (a badge, an icon by name from the library part `icons`, a title and a text) in a row or in two
  rows (`layout="grid"`), shown one per step. Optional arrows show the order (Z order in a grid); `hilite` marks a card
  with the `--emph` frame and tint. Japanese text wraps at likely phrase boundaries; text that does not fit is cut with
  … and reported. Variants rise, fade and draw.
