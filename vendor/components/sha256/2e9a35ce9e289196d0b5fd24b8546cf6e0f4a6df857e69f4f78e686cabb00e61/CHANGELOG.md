# m-orbit changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.4 (components 2.5.1)

- The lit side of the Moon and Venus and the sun disc are filled with the theme's --lit (light and what it lights; spec §8.4), outlined; without it, the same colours as before (--accent2 mixed with the background).

## 2.0.3 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: label and caption widths use base's measured textWidth in the deck's font (digits 0.6 em and Latin 0.55 em were too narrow).

## 2.0.2 (components 2.1.2)

- Fix: in a dark theme the lit and shadow fills were inverted (the lit part was darker than the shadow). The part now reads whether --bg is darker than --fg and picks fills so the lit part is always the lighter one; the light theme looks as before.
- Fix: an `earth` or `moon` value that is not a number, or out of range, drew NaN geometry. It is now reported (`attr`) and the default is used.
- Fix: the element had no accessible name. It is now role="img" with an aria-label that states the final position and its name (for example 「月の満ち欠け：位置 4、満月（地球から見た形）」); an author's aria-label is kept.

## 2.0.1 (components 2.1.1)

- Fix: the person on Earth no longer spins a full turn on a step between two positions with the same observer angle
  (e.g. `start` 1 → `visit` [2] with 8 positions, both held at evening). A full turn is added only when the step passes
  position 0 (new moon), e.g. 7 → 1 or 2 → 1.

## 2.0.0 (components 2.1.0)

- New part: the phases of the Moon (`mode="moon"`) and of Venus (`mode="venus"`). A top view seen from above the North
  Pole sits beside the view from Earth, both driven by one position. Shapes are computed from the geometry (phase angle
  and lit side), not drawn. Labels come from the lesson language and can be set per position. There is an observer
  on Earth with a line of sight, eclipse alignments (`eclipse`), and a southern-hemisphere orientation.
