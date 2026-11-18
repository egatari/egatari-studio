# m-ctable changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.0 (components 2.12.0)

- New part: a computed table filled step by step.
  - `anova`: fills its columns SS → df → MS → F → p.
  - `contingency`: margins, expected counts, χ² and the 2 × 2 odds ratio.
  - `po`: potential outcomes; the unobserved half is revealed, then the individual effects, then the ATE against the naive difference.
  - `table`: a plain table shown row by row.
- Each step marks its source cells and the cells it fills, with a formula line under the table.
- Checks the arithmetic, allowing for the rounding of the values written; p is not checked.
- The final table is also in `table[data-readable]`.
