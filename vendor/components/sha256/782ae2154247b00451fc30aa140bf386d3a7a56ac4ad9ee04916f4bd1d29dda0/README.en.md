---
summary: Fishbone (cause-and-effect) diagram, one main bone at a time, head last; auto layout
steps: bones + 1 (head), or the largest step
props:
  order: causes-first (default) or effect-first
  size: box text px (0 = 27, shrink to 24)
  fade: box appear (s)
  draw: line draw (s)
example: {"effect": {"label": "Late delivery"}, "nodes": [{"id": "p", "label": "People"}, {"id": "p1", "label": "Short-staffed", "parent": "p"}, {"id": "m", "label": "Machines"}, {"id": "m1", "label": "Truck breakdown", "parent": "m"}]}
---

Grouped causes of one effect (e.g. 4M: people, machines, methods, materials). No coordinates.

Child JSON: `{"effect": {...}, "nodes": [...], "edges": [...]}` (`edges` optional).

- effect (head): `label` (`\n`) or `tex`, `note` (under box), `tone` (default `emph`), `step`, `at`
- node: `id`, `label` (or `tex`), `note`, `parent`, `tone`, `step`, `at`. No `parent` = main bone; child = cause; grandchild = sub-cause (3 levels)
  - Bones in array order, left to right, top/bottom alternating; name boxed at the outer end (`note` outside)
  - Cause `tex` = KaTeX; `note` small after the name (`--muted`)
  - `tone`: bone = box and bone; cause = text and line (`emph` bold)
- edge: extra cause links (`from` `to` `label` `tone` `dash` `step`), dashed arrow bulging left of text; best within one bone
- `order`: `causes-first` or `effect-first` (head, spine first); node `step` wins
- `variant`: `fade` (default), `draw` (lines first), `grow` (boxes grow in); moves ≤ 12 px
- Fit (1280×720 body, ~440 px high): ≤ 3 rows (causes + sub-causes) per bone (4 if short), 4–6 bones, causes ≤ ~10 chars. Text ≥ 24 px; overflow spills and is reported. Too many: split or shorten

The demo is `demo.html` (delivery example fictional).

<!-- llm: omit -->
Notes

- Causes on lines off the bone; sub-causes off a drop from the cause line. `emph` box: `--emph-tint` fill, `--emph` frame/text. Bones 3.5 px, cause lines 2.5
- Moves within `fade` time. Lecture view (`ctx.preview`): later bones faint
- `fade`: boxes and text rise 12 px, then lines. `draw`: lines, then boxes slide 12 px from the spine side. `grow`: category boxes slide 12 px and grow from 0.92×; cause text slides from the bone; lines drawn together. Moves measured at box centre (conventions §1.2)
- Text 27 → 24 px; row height (52 → 40 px) and bone slope chosen to fit. Cause width estimated from characters (`tex`: non-symbol characters × 0.62). If 24 px won't fit: no smaller text (conventions §2.3), bones close to 12 px, least-overflow layout centred, shortfall via `ctx.report("size", …)`
- Spine 5 px (the only thick line); others ~3 px; all `--muted` (`--line` is for axes, ticks, grids)
- Edges are not in the layout (need room left of the text); linking causes on different bones may pass near other text
<!-- llm: end -->
