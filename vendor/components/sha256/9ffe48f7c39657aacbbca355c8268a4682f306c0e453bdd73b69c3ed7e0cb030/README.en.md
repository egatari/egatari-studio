---
summary: Waterfall: a baseline bar, then increases and decreases stacked from the previous bar's end, then a total bar
steps: max item step (default 1 bar = 1 step)
props:
  unit: value unit
  digits: decimals
  per-step: bars per step (0 = all)
  dur: grow seconds
  stagger: bar offset (s)
  min: axis start (0 = from 0; > 0 cuts the axis, with a break mark)
  ticks: ticks and grid
  links: dotted links between bars
  al: axis title
example: {"items": [{"label": "Last year", "value": 120, "total": true}, {"label": "Sales", "value": 45}, {"label": "Costs", "value": -30}, {"label": "This year", "total": true}]}
---

For what was added and taken away between a baseline and a total: profit bridges, budget against actual, population change.

Child JSON: `{"items": [...]}`.

- item: `label` (`\n` = 2 lines), `value`, `total` (true = a total bar from 0), `tone`, `step`, `at`
- The first total's `value` is the baseline; change bars start at the running total; a later total's `value` is checked (data)
- `min`: axis start for small changes on large values (break mark)
<!-- llm: omit -->
- `min` works when every bar end and total is ≥ `min`; total bars then rise from the axis bottom
<!-- llm: end -->
<!-- llm: omit -->
- Colours: totals `--term`, increases `--accent2`, decreases `--emph`; values sit above each bar's upper end, changes with `+` or `−` (direction is not shown by colour alone). Dotted links (`--muted`, `links="false"` to hide) join the bars at the running total.
- The preview view draws later bars, values and links fully grown at `--preview-opacity`.
<!-- llm: end -->
