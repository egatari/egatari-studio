# m-contour changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.13.0)

- New part: contours of a function of two variables, level by level, with labels on the lines (contour-core).
  - The function is an arithmetic formula `f` (expr; never run as code) or a script's `grid`.
  - Gradient arrows (central differences) with optional tangent lines.
  - A descent path one iterate per step, with f at the current point; `monotone` reports a rise.
