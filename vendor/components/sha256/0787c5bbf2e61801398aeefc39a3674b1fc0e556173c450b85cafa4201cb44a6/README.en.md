---
summary: Cycle diagram: stage boxes on a circle clockwise from 12, joined by arc arrows (last back to first too)
steps: number of stages (default 1 per step; per-step n each; node step wins)
props:
  per-step: stages per step (0 = all)
  size: box text px (shrinks to 24)
  dur: stage appear (s)
  stagger: box offset (s)
example: {"center": {"label": "PDCA"}, "nodes": [{"label": "Plan"}, {"label": "Do"}, {"label": "Check"}, {"label": "Act"}]}
---

Stages that repeat in order: PDCA, water cycle, cell cycle. No coordinates; list stages in order ([conventions](../../docs/conventions.ja.md) §2).

Child JSON: `{"nodes": [...], "center": {...}, "edges": [...]}` (`center`, `edges` optional).

- `nodes`: stages (3–8), in order clockwise from 12; arcs to the next, last→first automatic
  - `label` (`\n`) or `tex` (KaTeX), `note` (small 2nd line, `--muted`), `tone` (`term` default, `emph`, `muted`, `accent2`, `series-1..4`), `step`, `at`, `id`
- `center`: middle name, an object (`{"label": "PDCA", "note": "…"}`); appears with stage 1 (`center.step`). `m-pie`'s `center` is a string
  - same fields as nodes, no `id`; `tone: emph` box: `--emph-tint` fill, `--emph` frame/text
- `edges`: extra links (`from` `to` = node `id`s, `label` `tone` `dash` `step`); dashed arrows edge to edge
- Arrows `--muted`, 3 px

Layout:

- Wide spaces: ellipse up to 1.9× wider (never taller); sized to fit the element
- Incoming arrow appears with its box; last→first after the last box
- `variant`: `fade` (default), `draw` (arrows first), `grow`; same steps and end
- `cues(k)`: start times of 2nd+ boxes in one step

The demo is `demo.html`.

<!-- llm: omit -->
Notes

- `fade`: box rises 12 px, then incoming arrow. `draw`: arrow, then box slides 12 px from the previous side. `grow`: box slides 12 px and grows from 0.92× while the arrow draws. All within 12 px (box centre) and `fade` time (conventions §1.2)
- Lecture view (`ctx.preview`): later boxes and arrows faint
- Box width estimated from characters (CJK 1, digits 0.6, Latin 0.62)
- No fit (boxes overlap, no room for arrows, centre too big): text shrinks from `size` by 2px to 24px, then `ctx.report("size", …)`
- Arrows are elliptical arcs (SVG `A`), 8px from the box; over 8 stages they get too short
<!-- llm: end -->
