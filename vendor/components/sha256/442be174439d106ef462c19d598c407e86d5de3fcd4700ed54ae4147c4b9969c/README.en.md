---
summary: Rotate validation folds
steps: Rows → mean (k+1)
props:
  dur: Seconds
  size: Text px
---

JSON:
- `k`: 2–10; k=5: ≥316px tall (264 without errors)
- `errors`: k errors (optional).
- `labels`: k names (optional).

<!-- llm: omit -->
Equal blocks. Row i validates block i: emph tint + outline; training: term tint. Legend explains outline. Blocks ≥40px with enough height: T/V; short rows drop letters first, retaining the legend and outlines. Names once above. Errors/mean: 2 decimals. Final rule and mean below errors; omitted errors leave completed splits at k+1.

Wrong lengths, negative errors or invalid k: report, no draw. dur 1s; size 0=26px, ≥24. Bad props default/report.

Suggested width: 1184px. Rows shrink from ~46px to 32px before reporting. At default 26px text, minimum height = ceil(99.4+32k+56.1) = **156+32k px** with errors; **104+32k px** without. k=5: 316/264px; k=10: 476/424px. Compact row numbers/errors use monospace.

General: f=text px, L=1.45f+4, R=max(32,ceil(1.2f)); minimum=ceil(2L+16+kR+footer+4), footer=L+.4f with errors, else 0. Size reports give k, required/current height and its terms; legend width needed/available; label index and width needed/available.

ctx.lang selects ja/en. Font boxes ≥1.43em plus gap. Image role, final summary; preserve author label, hide SVG. No answer preview. Fictional demo.
<!-- llm: end -->
