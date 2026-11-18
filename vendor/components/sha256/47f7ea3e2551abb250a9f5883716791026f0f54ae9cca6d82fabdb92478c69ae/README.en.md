---
summary: 2-axis positioning map (4 quadrants); points one per step
steps: largest step / to.step (1 point = 1 step)
props:
  fade: point appear (s)
  move: to move (s)
  size: label px
  quads-step: quadrant-name step (0 = start)
example: {"x": {"lo": "Manual", "hi": "Auto"}, "y": {"lo": "Costly", "hi": "Cheap"}, "items": [{"label": "Co. A", "x": 0.25, "y": 0.7}, {"label": "Us", "x": 0.8, "y": 0.82, "self": true}]}
---

Positioning, effect×effort, SWOT: show the empty space.

Child JSON: `{"x": {"lo", "hi"}, "y": {"lo", "hi"}, "quads": {"tr", "tl", "bl", "br", "fill"}, "items": [...]}`.

- `x` `y`: axis end words (step 0)
- `quads`: names (tr = top-right, tl, bl, br); `fill: "tr"` tints one; names at `quads-step`
- item: `label`, `x` `y` (0–1; 0.5 = axis cross), `step` (default next), `at`, `tone` (`term`/`fg`; default muted), `anchor` (`right`, `left`, `above`, `below`), `r`
- `self: true`: big `--emph` point, ring pulse
- `to: {"x", "y", "label", "step", "at"}`: slides at `to.step` (default next), dashed trail; `label` on arrival
- `cues(k)`: start times of 2nd+ points in a step, for `{cue}`

The demo is `demo.html`. Names and positions are fictional.

Notes

<!-- llm: omit -->
- Labels crossing an axis move: opposite side → above → below (start and `to`; even with `anchor`). Axis lines have `class="axis"`; `tools/test-components.mjs` flags crossings
<!-- llm: end -->
- Quadrant names avoid points and labels (else labels move, or `ctx.report`)
- Label overlaps not fixed: change `anchor` or shift
