---
summary: Bars grow from 0 by step (vertical, horizontal, grouped, stacked); the axis max can widen by step
steps: max group/scale step (default 1 group = 1 step)
props:
  orient: v or h
  max: axis max (0 = auto)
  unit: value unit
  digits: decimals
  per-step: groups per step (0 = all)
  dur: grow seconds
  stagger: group offset (s)
  count: count values up
  ticks: ticks and grid
  zoom: scale-change seconds
  al: axis title
  stack: stack values; "percent" = 100 %
example: {"series": [{"label": "Sales"}], "groups": [{"label": "Year 1", "value": 1.2}, {"label": "Year 2", "value": 3.4}]}
---

For quantities shown and compared one at a time: yearly sales, ranked answers, before/after.

Child JSON: `{"series": [...], "groups": [...], "scale": [...]}`.

- group: `label` (`\n` = 2 lines), `value` or `values` (one per series), `step`, `at` (start s), `tone` (bar and value colour)
- series: `label` (2+ series: on the first group's bars; no legend), `tone` (default `--series-1..4`)
- scale: `[{"step": 3, "max": 27, "at": 0.4}]`: the max moves to `max` over `zoom` s; the old range stays as a faint band; taller bars stop at the top and grow as it widens
<!-- llm: omit -->
- Auto max: 1.12 × the largest value (before the first scale), rounded
<!-- llm: end -->
- `orient="h"`: names left, values right; `ticks="false"` for ranks
- `stack="true"` (`"percent"` = 100 %): a group's `values` in one bar; total at the end, values inside segments; values ≥ 0
<!-- llm: omit -->
- Values: `digits` decimals, thousands separators, `unit` appended
- Negatives (not stacked): the axis includes 0; bars grow down/left from a `--fg` baseline; values outside the bar end
- `stack="percent"`: axis 0–100 %, no `max`/`scale`, segment values in % when they fit, no total
- Show later steps faintly (`ctx.preview`): later bars fully grown at `--preview-opacity`; no axis change or over-max bar shown ahead
<!-- llm: end -->

The demo is `demo.html`. All numbers are fictional.

Notes

- Values appear once a bar is fully grown; `count="true"` counts them up
- Series names sit on the first group's bars: keep to 2–3 series

<!-- llm: omit -->
- `examples/tmlr2026-calibration` keeps its own deck-local `components/bars/`
<!-- llm: end -->
