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

- `code`: ≤76 chars/line; height ≈ 132+34×lines+35×(list rows−1), ~40 chars/row; >440px: cut/split.
- `lang`: tag; `steps[{lines,note}]`: 1-based range, note.
- `output`: ≤8 lines.

Narration: explain each line; never read code aloud.

<!-- llm: omit -->
Displays supplied text; never runs code. Code first, then highlights and notes. Beside: natural code width ≤55% and every note fits; earlier notes stay muted, all shown at completion. Otherwise band: only the current note, prefixed “lines 3–4”. Final/print: numbered compact list, no code highlight. If the list needs more height, report and keep the last numbered note. Deterministic seeking. Preview uses --preview-opacity; the final list previews before notes begin.

dur .6s; size 0=24px code/26px notes, otherwise ≥24. outputPos auto/below/right. Beside auto: right for ≤8 lines when columns fit. Band auto: right when natural code width ≤70% and output fits, else below the band. Explicit right/below retained. Bad props report/default.

Python/R/shell # and JS // outside strings are muted. Tabs: four spaces. Monospace width .6em, wide characters 1em. Full-width band mode at 1184px/24px fits 77 ASCII characters with single-digit line numbers, 76 with two digits. Beside notes/right output reduce this. Beside notes wrap/stack with connectors; each band note is one truncated row.

Default height, one band row, right/no output: header 50 + n × row 34 + padding 16 + gap 8 + band 58 = **132 + 34n px**. General: r=ceil(1.4×size), header=r+16, b=ceil(1.45×note px+4)+16; H=header+n×r+16+8+b. No notes: omit 8+b. Below output adds 16+header+output rows×r+16. Final list (24px, 35px rows) packs “3–4: note” items; each row beyond one adds 35px. Auto output that would go below sits beside the band when its natural width ≤45%; the zone is then max(band, output). Every “give the element about H px” uses this formula; above 440px (body under a heading) reports give lines that fit at 440px and say fewer lines/shorter notes/split instead. If only the list misses, all code stays and the final state keeps the last note.

| Height | Code lines (one band row) |
|---|---|
| 380px | 7 (needs 370px) |
| 440px | 9 (438px) |
| 540px | 12 (540px) |
| 680px | 16 (676px) |

A 59-character line exceeds 70% width: auto output goes below. Seven lines + band + one output row need 486px; two output rows need 520px. Without output, 380px fits. Separate layout reports give line count/capacity/needed height, longest line/character capacity, or note index/width/capacity/target length. Oversize text truncates with …; tiny elements retain clipped content and numeric size reports. Code ≤16 lines, output ≤8. Invalid ranges report; no highlight/connector, notes/steps preserved.

ctx.lang ja/en. Figure role; author label preserved; SVG hidden. Full source/output in non-focusable sr-only pre. All notes remain in the accessible summary. Fictional sales data.
<!-- llm: end -->
