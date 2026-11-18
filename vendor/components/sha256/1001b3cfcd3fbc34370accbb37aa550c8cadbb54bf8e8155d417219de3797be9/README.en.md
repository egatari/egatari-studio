---
summary: Outcomes → values → distribution
steps: Outcomes → arrows → groups → bars (4)
props:
  dur: Motion s
  stagger: Arrow delay s
  digits: Decimals
  size: Text px
example: {"outcomes":[{"label":"HH","x":2},{"label":"HT","x":1},{"label":"TH","x":1},{"label":"TT","x":0}],"name":"X","unit":"","fractions":true}
---
- `outcomes`: 2–12; `label`, `x`, `p` (default equal; sum ≠ 1 reported)
- `name` (X), `fractions`
- `picture`: `dots`, `grapes`, `dice`, `coins`, `balls` (colour names; 11 basic)

<!-- llm: omit -->
For introductory probability. Left: Ω; centre: values; right: distribution. Chips → arrows → shared colours, counts and sums → bars, end labels and total. Final state stands alone; no answer preview.

- `outcomes`: 2–12 items; short `label` (≤6 chars advised), finite `x`. Repeated values allowed. Input chip order; numerical axis increases upwards.
- `p`: optional. All omitted: `1/n`. Mixed: report `data`, missing = 0. Sum outside 1±1e-9 or p outside 0–1: report, retain values. No normalization.
- `name`: X; `unit`: suffix, default empty. Literal labels.
- `fractions`: defaults true for equal probabilities. Reduced fractions: denominator ≤10000, error ≤1e-9; otherwise `digits` decimals. Invalid totals stay unrounded.
- `picture`: draw outcomes: `dots`/`grapes` (x items, 0–15), `dice` (label face 1–6), `coins` (◯ heads, ● tails), `balls` (colour names per outcome `balls` or label characters; 11 basic colours; name shown)

Equal probabilities: shown once in the title. Colours cycle series-1..4 by ascending value. Bar scale includes 0–1; extends for invalid data.

About 1184×440px for 4 outcomes; rows ≥40px; tight space reports `size`.

Fictional grapes: X = berries per bunch.

Keep enough height for probabilities below chip labels.
<!-- llm: end -->
