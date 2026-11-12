---
summary: Table comparing 2–3 things: one column, the other, then row differences
steps: columns + 1 (diff step; none if no diff/better)
props:
  size: value text px (shrinks to 24)
  dur: column appear (s)
  diff-label: diff column heading
example: {"sides": [{"label": "Paper form", "tone": "muted"}, {"label": "Online form"}], "rows": [{"label": "Hours", "values": ["Weekdays 9–17", "24 h"], "better": 1, "diff": "Any time"}]}
---

2–3 things on the same points (old vs new, A vs B). Bars: `m-bars`; one number: `m-kpi`.

Child JSON: `{"sides": [{"label", "tone"}, …], "rows": [{"label", "values": [...], "diff", "better"}, …]}`.

- `sides`: 2 or 3; `label` = column heading; `tone` (`term`, `emph`, `muted`, `accent2`, `series-1..4`; default `term`, `accent2`, `series-4`); `muted` = old
- `rows`: `label` = point (optional); `values` in column order (text/number; `\n`), count = `sides` (else error card)
- `diff`: short difference, `--emph`, right column
- `better`: better column index (from 0): bold, `--emph` frame at diff step
- Steps: column 1 (+ point names) → 2 → (3) → diffs; column `step` overrides
- `variant`: `fade` (default), `slide`, `reveal` (row by row); same steps

The demo is `demo.html` (forms example fictional).

<!-- llm: omit -->
Notes

- Text width estimated from character count (CJK 1, Latin 0.6); may be off by a few characters
- Show later steps faintly (`ctx.preview`): later columns and diffs at `--preview-opacity` (default 0.45)
- Moves 16 px over `dur` (default 0.6 s); `reveal` rows dur/2 each, staggered within dur/2
- Table is top-aligned; spare height goes to rows
- Text shrinks from `size` to 24 px to fit; `slide` enters from the sides; all variants same end
<!-- llm: end -->
