---
summary: Repeated z intervals
steps: Axis → intervals → coverage (3)
props:
  dur: Seconds
  fast: Fast seconds
  size: Text px
---

JSON:
- `mu`, `sigma`, `n`: mean, SD, size.
- `reps` (40), `level` (.95), `seed`.

<!-- llm: omit -->
Known σ, z=1.645/1.96/2.576 for .90/.95/.99; Acklam inverse-normal otherwise. Mulberry32 + Box–Muller. Coverage is observed, not guaranteed. Confidence concerns repeated intervals containing fixed μ.

First three: dur each; rest: fast total. Final misses: thicker emph; hits: term. dur 1s, fast 2.5s; size 0=26px, ≥24. Bad props default/report; bad data or unrepresentable range: report, no draw; bad seed: 2.

1184×440px for 40 intervals. Rows ≥6px; nice ticks; report cramped layouts.

ctx.lang selects ja/en. Font boxes ≥1.43em plus gap. Image role, final summary; preserve author label, hide SVG. No answer preview. Fictional demo.
<!-- llm: end -->
