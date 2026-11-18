---
summary: ANOVA, contingency and potential-outcome tables filled by step; sources, results and a formula line; arithmetic checked
steps: fill stages
props:
  dur: s per step
  digits: decimals
  size: text px
example: {"kind": "anova", "rows": [{"name": "A", "ss": 120, "df": 2, "ms": 60, "f": 7.5}, {"name": "E", "ss": 96, "df": 12, "ms": 8}, {"name": "T", "ss": 216, "df": 14}]}
---

From a script; arithmetic checked. `kind`: anova, contingency, po, table.
<!-- llm: omit -->
- `anova`: rows `{name, ss, df, ms, f, p}`; the last row is the total, the one before it the error (`role` overrides); columns filled SS → df → MS → F → p. `contingency`: `rows`, `cols`, `n`; `margins` (default true), `expected`, `chi2` (no continuity correction), `or` (2 × 2). `po`: units `{id, t, y0, y1}`; the unobserved side is "?" on a light ground; steps reveal it, then Y(1) − Y(0), then the ATE and the naive difference (`ate`, `naive` checked). `table`: `header` and `rows`, one row per step.
- Checks (data) within the rounding written; p is not checked. Source cells `--accent2`, filled cells `--emph` during their step. The whole table is in `table[data-readable]`. No answer preview.
<!-- llm: end -->
<!-- llm: omit -->
Notes: keep decimals consistent per column; say in the script that real data shows only one of the two potential outcomes.
<!-- llm: end -->
