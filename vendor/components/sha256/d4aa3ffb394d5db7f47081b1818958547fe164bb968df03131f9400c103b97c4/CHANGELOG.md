# m-mapping changelog

## 2.1.0 (components 2.15.0)

- Marks what it draws for Studio's geometry check (R-geometry): the outcome chips (`o1`, `o2` …) and the value boxes (`v1`, `v2` …) as boxes with their text as labels (the count and probability beside a value box as labels outside it), and each arrow from a chip to its value box as an edge (the head left out). The bar chart on the right is not marked. The drawing does not change.

## 2.0.2 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.1 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.0 (components 2.6.0)

- New stats part: outcome chips, staggered mapping arrows, shared-value counts and probability sums, then aligned distribution bars.
- Preserve supplied probabilities; report mixed, out-of-range and non-unit sums without normalization. Equal outcomes default to reduced fractions.
- Japanese/English text, final-state accessible name, author label preservation, numerical value axis, size reports and no answer preview.
