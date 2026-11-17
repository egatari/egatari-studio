# m-vector changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.13.0)

- New part: plane vectors and 2 × 2 matrices, step by step, with a formula panel.
  - Ops: `sum` (tip to tail), `diff`, `scale`, `proj` (perpendicular and shadow), `dot` (with the component formula).
  - `matrix`: the grid, the unit square and the vectors move from I to M; eigenvector spans and the determinant.
  - `basis`: the new basis grid and each vector's coordinates in it.
- The part computes; `value` written in the data is checked against the computation.
