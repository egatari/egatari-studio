---
summary: Hierarchy tree (org chart, taxonomy), built level by level from the root; auto layout
steps: depth (by="level") or node count (by="node"); or the largest step
props:
  orient: down (default) or right
  by: level (default) or node (depth-first)
  link: elbow (default) or straight
  size: box text px (0 = 27, shrink to 24)
  fade: box appear (s)
  draw: line draw (s)
example: {"nodes": [{"id": "r", "label": "Animals"}, {"id": "a", "label": "Vertebrates", "parent": "r"}, {"id": "b", "label": "Invertebrates", "parent": "r"}]}
---

Parent–child structures (org charts, taxonomies, outlines). No coordinates; laid out without overlaps.

Child JSON: `{"nodes": [...], "edges": [...]}` (`edges` optional).

- node: `id`, `label` (`\n`) or `tex` (KaTeX), `parent` (parent `id`; exactly one root without `parent`), `note` (small, **under** box), `tone` (`term` default, `emph`, `muted`, `accent2`, `series-1..4`), `step`, `at` (start s)
- Children in array order; parent centred over them
- edge: extra links (`from` `to` `label` `tone` `dash` `step`), dashed arrow outside the tree; best at same depth; step: later end
- Child `branch`: line text (e.g. probability). `path`: root-first `id`s highlighted in turn (default 1 step per line, after the tree; `pathStep`: in one step; `pathNote`: end note)
- `orient="right"` for wide taxonomies. `by="node"`: one at a time, depth-first (to follow a branch). Node `step` wins
- Lines `--muted`, 3 px; `tone: emph` box: `--emph-tint` fill
- Fit (~440 px high): ~8 four-character boxes per level (`down`), ~7 (`right`); ~5 levels. More leaves: 2 staggered rows (~16 / ~11), then 2-line names. Text ≥ 24 px; overflow spills, reported. Too many: split
- `variant`: `fade` (default), `draw` (lines first), `grow`
- Lecture view (`ctx.preview`): later parts faint

The demo is `demo.html` (company and values fictional).

<!-- llm: omit -->
Notes

- Moves ≤ 12 px within `fade` time. Edge step default: later end; edges bulge outward (`down` below, `right` right)
- Layout: subtrees placed bottom-up and pushed together until level contours touch (Reingold–Tilford); small subtrees in between go left
- Text 27 → 24 px (`size` fixes it). Width estimated from characters (CJK 1, others 0.6)
- At 24 px, no smaller text (conventions §2.3); tries: stagger children of parents with ≥ 3 leaf children (not with `straight`) → wrap names (≥ 4 chars, no `\n` or `*_^`; at the middle space, or after a mid hiragana; single Latin words never). Else least-overflow layout; shortfall via `ctx.report("size", …)`
- Motion: `fade` from below; `draw`, `grow` from the parent's direction, 12 px (root always as `fade`). `grow` from 0.92×
- `branch`: 24 px, `--fg`. `elbow` bends 20 px from the parent, text on the child line; levels widen to fit (`right` +52 px, `down` ≥ 76 px); no staggering. `straight`: outside the line's middle (crowded at ≥ 3 children)
- `path`: must start at the root, each pair parent–child, else a data card. Default: one step per line after the tree's last step. `pathStep`: drawn in that step (`draw` s each). `--emph` 6 px over the line, `--emph` 4 px frame on reached boxes, `branch` in `--emph`. `pathNote` beyond the end box after the last line; may overlap if the end box is not at the deepest level
- Lecture view: later path faint; `branch` colour changes only at its step
- Edges take room outside the tree (`down`: 56 px below, +36 with a label); across depths they may cross boxes
<!-- llm: end -->
