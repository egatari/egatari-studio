# m-contour changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.0 (components 2.13.0)

- New part: contours of a function of two variables, level by level, with labels on the lines (contour-core).
  - The function is an arithmetic formula `f` (expr; never run as code) or a script's `grid`.
  - Gradient arrows (central differences) with optional tangent lines.
  - A descent path one iterate per step, with f at the current point; `monotone` reports a rise.
