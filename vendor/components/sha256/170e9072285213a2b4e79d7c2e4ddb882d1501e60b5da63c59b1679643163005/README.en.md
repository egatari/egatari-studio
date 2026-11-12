---
summary: Balance at expectation
steps: Weights → pivot → sum (3)
props:
  dur: Seconds
  digits: Decimal places
  size: Text px
---

JSON:
- `values`: 2–12 distinct numbers.
- `probs`: sum to 1 (else reported).
- `name`: X.

<!-- llm: omit -->
Bars proportional to probabilities. Pivot: minimum → E[X]. Moment controls tilt, clamped ±8°, then levels. Beam, bars and ticks rotate together. Starts horizontal; tilts at step 2. Final E and mtext sum; first 6 terms then …; computation and accessible weights include all terms. Negative terms parenthesized.

Invalid totals stay unnormalized. Out-of-range probabilities, mismatched lengths, duplicates or unrepresentable calculations: report, no draw. dur 1.5s; digits 0–10 (2), trailing zeros removed; size 0=26px, ≥24. Bad props default/report.

1184×440px suggested. Scaled coordinates, nice ticks. Close bars, labels or long sums report size.

ctx.lang selects ja/en. Font boxes ≥1.43em plus gap. Image role, final summary; preserve author label, hide SVG. No answer preview. Fictional demo.
<!-- llm: end -->
