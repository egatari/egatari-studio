---
summary: A positioning table: the cross of two axes (studies in cells, this work framed, empty cells — with a note) or studies × elements (✓ △ × or short text), filled by step
steps: cross: axes → studies → this work → notes (order="whole": 1). attributes: per column or row (order) + frame
props:
  order: cross build|whole; attributes whole|col|row
  dur: seconds per step
  size: text px (≥ 24)
example: {"kind": "cross", "rows": {"axis": "Criterion", "values": ["Error", "Bayes risk"]}, "cols": {"axis": "Output", "values": ["Point", "Distribution"]}, "cells": [[["[1]", "[2]"], ["[3]"]], [{"none": "Trivial"}, {"self": true}]]}
---

`kind`: `cross` (default) or `attributes`.

- cross: `rows`, `cols` = `{"axis", "values"}` (2–4 each). `cells[r][c]`: study names (1–3), `{"self": true}` or `{"none": "why"}` (— and a note). `marks`: `[{"mark": "†", "text"}]`
- attributes: `cols` names; `rows` `{"label", "cells", "self"}`, this work first
- This work is written out and framed in `--emph`
<!-- llm: omit -->
- Readable table: headers as "axis: value". Text shrinks to 24 px, then reports size.
<!-- llm: end -->
