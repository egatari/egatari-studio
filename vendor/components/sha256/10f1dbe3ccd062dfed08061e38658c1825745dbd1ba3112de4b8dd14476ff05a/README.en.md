---
summary: Code notes
steps: Code → notes → output (n+1/+2)
props:
  dur: Seconds
  size: Text px
  outputPos: Output
example: {"lang":"python","code":"import pandas as pd\ndf = pd.read_csv(\"sales.csv\")\ndf.groupby(\"store\")[\"sales\"].mean()","steps":[{"lines":[1],"note":"Load pandas"},{"lines":[2],"note":"Read CSV"},{"lines":[3],"note":"Mean"}],"output":"store\nA    120.5\nB     98.0"}
---

`<m-code>` child JSON.

- `code`: ≤16 lines; ~60 chars/line.
- `lang`: tag; `steps[{lines,note}]`: 1-based inclusive range, note.
- `output`: text, ≤8 lines.

Narration never reads code aloud; say what the line does.

<!-- llm: omit -->
Displays supplied text; never runs code. Code first, then one highlight and note per step; earlier notes muted. Final: all notes, no band, supplied output. Preview uses --preview-opacity. Deterministic seeking.

dur .6s; size 0=24px code/26px notes, otherwise ≥24. outputPos auto/below/right; auto uses right for ≤8 code lines when columns fit. Invalid props report/default.

Python/R/shell # and JS // comments outside strings are muted. Tabs: four spaces. Monospace width .6em, wide characters 1em. Notes wrap and stack; connectors extend. Line spacing exceeds 1.43em.

1184×440px suggested. Oversize code/output: layout report, truncate with …; overflowing notes: report/omit box. Small elements: size report. Invalid ranges: range report, no band/connector; preserve notes and steps.

ctx.lang ja/en. Image role; final summary preserves author label; SVG hidden. Full code/output in sr-only pre, focusable document so it remains accessible inside image role. Fictional sales data.
<!-- llm: end -->
