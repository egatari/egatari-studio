---
summary: KPI cards by step; count-up, change arrow, note
steps: largest card step (default 1 card = 1 step)
props:
  cols: cards per row (0 = count, ≤ 4)
  digits: decimals (card wins)
  per-step: cards per step (0 = all)
  dur: count seconds
  stagger: card offset (s)
  count: count up
  size: number px (0 = auto)
example: {"cards": [{"label": "Drafting time", "value": 62, "unit": "%", "prefix": "−", "delta": {"dir": "down", "text": "8 pt vs last", "good": true}}]}
---

Child JSON: `{"cards": [{"label", "value", "digits", "unit", "prefix", "from", "tone", "delta", "note", "step", "at"}, …]}`.

- `label`: above. `value` (`digits`, commas). `unit`: after. `prefix`: before (`+`, `~`). Negative `value` has its own −: no `prefix` `−` (−−12); `prefix: "−"` only with a positive decrease
- `from`: count start (default 0; may count down)
- `tone`: number, top band (`term`, `emph`, `accent2`, `series-1..4`)
- `delta`: `{"dir": "up" | "down", "text": "+4", "good": true}`: ▲/▼ + text; good (default `up`) `--term`, bad `--emph`
- `note`: bottom line
<!-- llm: omit -->
- Count-up eases out; depends on (k, t) only (t = Infinity = final). `count="false"`: no counting
<!-- llm: end -->
- `variant`: `count` (default), `rise`, `flip`, `underline`; `count="false"` → `rise`
- `cues(k)`: start times of 2nd+ cards in a step (for `{cue}`)

The demo is `demo.html`. All numbers are fictional.

<!-- llm: omit -->
Notes

- `rise`: final value grows in; `flip`: digits flip from the right. Cards wrap past `cols`
- Number and unit width estimated from characters and centred; the right edge stays put while counting; may be off by a few characters
<!-- llm: end -->
