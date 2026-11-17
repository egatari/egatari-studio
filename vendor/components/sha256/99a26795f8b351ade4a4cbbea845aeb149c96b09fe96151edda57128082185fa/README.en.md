---
summary: Venn of 2–3 sets, one by one; then overlaps with items
steps: sets + 1 (overlaps="each": sets + overlaps with items, or all overlaps if none)
props:
  size: item text px (shrinks to 24)
  dur: set appear (s)
  spread: centre distance ÷ radius (0.7–1.3)
  overlaps: together or each
example: {"sets": [{"label": "Mammals"}, {"label": "Sea animals"}], "regions": {"A": ["Lion"], "B": ["Tuna"], "AB": ["Whale", "Dolphin"]}}
---

Shared and distinct traits. Per-point values: `m-compare`.

Child JSON: `{"sets": [{"label", "tone"}, …], "regions": {"A": [...], "B": [...], "AB": [...], …}}`.

- `sets`: 2 or 3; `label` outside; `tone` (`term`, `emph`, `muted`, `accent2`, `series-1..4`; default `term`, `accent2`, `series-4`). Avoid `emph` (used for overlaps)
- `regions`: items per region (array or `\n` text). Keys: letters in alphabetical order, A B C = `sets` order:
  - `A`: only A; `AB`: A and B (with 3 sets, not C); `ABC`: all three
  - 2 sets: `A` `B` `AB`; 3: `A` `B` `C` `AB` `AC` `BC` `ABC`; all optional. C keys with 2 sets: error card
- Area not to scale. `spread` (default 1): smaller = more overlap
- Overlap items bold; 1–2 words with 3 sets
- Steps: each set with its own items → overlaps (those with items tinted `--emph`, outlined, items shown; if none have items, all). `overlaps="each"`: one by one (`AB`, `AC`, `BC`, `ABC`)
- `variant`: `fade` (default), `draw` (outlines first)

The demo is `demo.html` (skills example fictional).

<!-- llm: omit -->
Notes

- Layout: 2 sets left/right; 3 top-left, top-right, bottom. Items placed farthest from circle lines
- Item width estimated from characters (CJK 1, Latin 0.6). 3-set overlaps are small: 1–2 words. Shrinks to 24 px, then ctx.report
- Overlaps are clipPath cut-outs; theme variables only
- Show later steps faintly (`ctx.preview`): later circles and overlaps at `--preview-opacity` (default 0.45)
<!-- llm: end -->
