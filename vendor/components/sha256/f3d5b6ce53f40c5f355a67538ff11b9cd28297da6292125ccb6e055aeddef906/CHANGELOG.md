# m-cards changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.3 (components 2.5.0)

- Spare height is balanced, not filled: a card's content (icon, title, text) sits in the vertical middle of the card; the number circle stays in the corner (owner, 11/8).

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: titles and texts wrap by base's measured textWidth in the deck's font (digits and Latin were taken as 0.6 em, about 25 % too narrow, so a line with numbers or English could run past the card).

## 2.0.1 (components 2.1.2)

- Fix: in a 3×2 grid with `arrows`, the arrow from card 3 to card 4 was a chevron at the middle of the slide, under card 2 and pointing at card 5. The row-change arrow now leaves the bottom of the last card of the first row, runs left between the rows and comes down into the first card of the second row (2×2 likewise for 2→3).
- Fix: an element with no height drew rects with negative heights. The part now reports `size` and draws nothing.
- Fix: the svg was role="list" with no name. It now has an aria-label: the author's, else the number of cards and their titles (「カード 4 枚：…」).

## 2.0.0 (components 2.1.0)

- New part: 2–6 cards (a badge, an icon by name from the library part `icons`, a title and a text) in a row or in two
  rows (`layout="grid"`), shown one per step. Optional arrows show the order (Z order in a grid); `hilite` marks a card
  with the `--emph` frame and tint. Japanese text wraps at likely phrase boundaries; text that does not fit is cut with
  … and reported. Variants rise, fade and draw.
