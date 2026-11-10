---
summary: Rotate validation folds
steps: Rows → mean (k+1)
props:
  dur: Seconds
  size: Text px
---

JSON:
- `k`: integer 2–10.
- `errors`: k errors (optional).
- `labels`: k names (optional).

<!-- llm: omit -->
Equal blocks. Row i validates block i: emph tint + outline; training: term tint. Legend explains outline. Blocks ≥40px: T/V. Names once above. Errors/mean: 2 decimals. Final rule and mean below errors; omitted errors leave completed splits at k+1.

Wrong lengths, negative errors or invalid k: report, no draw. dur 1s; size 0=26px, ≥24. Bad props default/report.

1184×440px for k=5; about 700px tall for k=10. Report cramped rows, labels or legend.

ctx.lang selects ja/en. Font boxes ≥1.43em plus gap. Image role, final summary; preserve author label, hide SVG. No answer preview. Fictional demo.
<!-- llm: end -->
