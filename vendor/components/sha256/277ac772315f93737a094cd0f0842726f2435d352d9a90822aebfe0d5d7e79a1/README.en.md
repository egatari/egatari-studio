---
summary: Positioning figure: per question, earlier vs this work's answer (unknown dashed), or assumption chips with this work's dropped and added; by step
steps: answers: questions → earlier answers → arrows and this work (order="row": per row). assumptions: studies → this work kept, dropped → added → yields. order="whole": 1
props:
  order: build (default), row (answers), whole
  dur: seconds per step
  size: text px (≥ 24)
example: {"kind": "answers", "rows": [{"q": "Where is the gap?", "before": {"unknown": true, "near": "Between countries [2]"}, "after": "70% between schools", "basis": "3 years, all pupils"}]}
---

Novelty in an answer or a view (not m-matrix). `kind` in the JSON.

- `answers` (default): `rows` 1–3 `{"q", "before": {"text", "by"}, "after", "basis"}`; no earlier answer: `"before": {"unknown": true, "near"}` (dashed, "Unknown")
- `assumptions`: `studies` 1–3 `{"label", "chips", "result"}`; `self` `{"kept", "dropped", "added", "result"}`; dropped struck, added `--emph`, both labelled
- This work written, framed; `selfLabel`, `heads` (3) rename
- Name the nearest work (`by`, `label`). By premise: m-tree `dash`

<!-- llm: omit -->
Notes

- Text 28 → 24 px; at 24, no smaller, the size needed is reported. Text wraps to its column, balanced; rows grow to the element's height (≤ 2×)
- Readable table: the final state, "Unknown (near)", "dropped: " / "added: "
<!-- llm: end -->
