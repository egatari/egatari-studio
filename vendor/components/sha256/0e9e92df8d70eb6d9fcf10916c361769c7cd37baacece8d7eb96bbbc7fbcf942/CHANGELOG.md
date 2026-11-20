# m-vector changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.0 (components 2.16.0)

- Marks what it draws for Studio's geometry check (R-geometry, spec §8.4): each arrow is an edge (its line, not the head) and a vector's or a result's name is a label of its arrow. The drawing does not change.

## 2.0.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.0 (components 2.13.0)

- New part: plane vectors and 2 × 2 matrices, step by step, with a formula panel.
  - Ops: `sum` (tip to tail), `diff`, `scale`, `proj` (perpendicular and shadow), `dot` (with the component formula).
  - `matrix`: the grid, the unit square and the vectors move from I to M; eigenvector spans and the determinant.
  - `basis`: the new basis grid and each vector's coordinates in it.
- The part computes; `value` written in the data is checked against the computation.
