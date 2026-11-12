---
summary: Predict, reveal; votes as bars, answer framed
steps: 0 question, 1 bars, answer-step (2)
props:
  answer-step: 2 or more (default 2); after the step-1 count
  unit: count unit
  poll: live poll id
  ticks: grid
example: {"question": "Which falls first?", "choices": [{"label": "Heavy"}, {"label": "Light"}, {"label": "Same"}], "answer": 2, "counts": [14, 3, 9], "note": "No air: same"}
---

Child JSON: `{"question", "choices": [{"label", "tone"?}], "answer": 0-based, "counts"?: [sample], "note"?: answer line, "labels"?: {"correct"?: mark (default "✓ Correct")}}`

- 2–6 choices. Video/print/start show `counts` (or 0)
- Script uses `counts`; vote at `{note:hands up}` (parens get read)
- `poll="p1"`: live poll totals

<!-- llm: omit -->
Notes for authors of parts (check with dev)

- Steps: 0 question, choices, ticks (context first); 1 bars and controls; `answer-step` frame, "✓ correct", `note`, others faded, text `--muted` (≥ 4.5:1)
- Show later steps faintly: nothing ahead shown (`static preview = "none"`, manifest `preview: "none"`)
- Viewer state (spec §8.4): counts and guess survive step changes on the slide; reset to author values only on `ctx.entered` (since 2.0.0); `ctx.reset` only drops focus
- Hands up; teacher counts ±1 or types. Alone: click = guess. Counts kept while on the slide
- Print: author values, no guess marks; screen counts restored after
- Methods: `input(choice, count)` (0–9999 integer, else console.warn; no-op in video); `counts()`
- On change: `CustomEvent("egatari-input", {bubbles: true, detail: {counts}})`
- live: `ctx.live?.poll(id)` → `number[] | null`; bars only for arrays, not in video/print
- `static interactive = true`, `static viewerInput = true` → manifest
- Keys: `+` `-` `↑` `↓` (buttons also `←` `→`); no digit keys; Esc/Enter leave the field
- No controls in video; hidden in print
- UI text (mark, labels, announcements) follows ctx.lang; `labels.correct` overrides the mark
<!-- llm: end -->
