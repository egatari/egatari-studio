---
summary: Pie/donut; labels inside big slices, leader lines for small
steps: 1 (all at once); per-step n slices; or slice step
props:
  donut: inner radius ratio (0 = pie)
  unit: value unit
  digits: value decimals
  pct-digits: percent decimals
  show: pct, value, both or none
  per-step: slices per step (0 = all)
  dur: step seconds
example: {"slices": [{"label": "Food", "value": 7.2}, {"label": "Housing", "value": 8.5}, {"label": "Other", "value": 2.1, "tone": "muted"}]}
---

Shares of a whole, all at once. Fine comparison: `m-bars`.

Child JSON: `{"slices": [...], "center": "…"}`.

- slice: `label`, `value` (percent computed), `tone` (`term` `emph` `accent2` `muted` `fg` `series-1..4`), `step`, `place` (`auto` default, `in`, `out`)
  - Clockwise from 12 in order; "Other" last, `"tone": "muted"`
  - ≤ 6–7 slices
- `center`: hole text, a string (`\n`; `{total}` = sum, e.g. `"Answers\n{total}"`); `m-cycle`'s `center` is an object
- `donut`: `0.5`–`0.6`
- `show` (under name): `pct` (default), `value`, `both`, `none`
- `unit` `digits`: value unit, decimals; `pct-digits` (default 0). Percents rounded to sum to 100%
- Steps: all at step 1; `per-step="1"` only if narrated slice by slice (outline faint). Slice `step` wins
- `variant`: `fade` (default), `sweep` (clockwise from 12), `grow` (rim grows out)

The demo is `demo.html`. All numbers are fictional.

<!-- llm: omit -->
Notes

- Default colours `--series-1..3`, slices 4–6 lighter, 7th `--series-4`. Values: thousands commas
- Inside labels on dark slices use bg colour; one-sided outside labels centre with the pie
- Labels inside if they fit, else in side columns with leader lines, de-overlapped
- Show later steps faintly (`ctx.preview`): later slices faint
- `sweep`: names after all slices are out
- Text width estimated from characters; "fits inside" = all 4 label-box corners in the sector (`show="both"` also tries 2 lines)
- Reported (`ctx.report`): outside labels too tall or too wide, hole text wider than the hole, negative values
- Motion: `fade` rises 12 px; `grow` rim from 12 px inside (conventions §1.2); `sweep` does not move
<!-- llm: end -->
