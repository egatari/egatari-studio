---
summary: Search, tours: current, frontier, visited, chosen edges, total
steps: #steps
props:
  dur: s per edge
  size: text px
  weights: show w
example: {"nodes": [{"id": "A", "x": 0, "y": 0}, {"id": "B", "x": 4, "y": 0}], "edges": [{"from": "A", "to": "B", "w": 4}], "steps": [{"current": "A", "frontier": ["B"]}, {"current": "B", "take": [["A", "B"]], "total": 4}]}
---

From a script; 440px alone, 380px under text. Unset fields persist; `[["C", 3]]` keyed; `take`/`drop` edit chosen edges. `total`: path to `current` if `parent`, else Σ taken `w` (`w` at its precision); counts: `total.check: false`.
<!-- llm: omit -->
- Child JSON: node `id` `x` `y` (your units, y down) `label`; edge `from` `to` `w`; `directed: true`. Step: `current`, `visited`, `frontier`, `parent` (`{"C": "A"}`), `take`/`drop` (`[["A", "C"]]`), `total`, `note`. `frontierKind` queue, stack, pq, set; `total` `{"label", "unit"}`.
- Omitted fields carry over (`current: null` clears); `parent` accumulates (`null` removes); `take`/`drop` change the chosen edges. `complete: true`: a complete graph with no edges drawn (tours).
- Self-loops (`from` = `to`) are small loops outside the node, facing away from its other edges. In a directed graph, A→B and B→A both present are drawn as arcs bowing to the right of travel (weights on the outer side). `stochastic: true` (directed) checks that each node's outgoing `w` sum to 1 (data).
- Checks (data): unknown ids, `take` of a missing edge, `drop` of an edge not chosen. `total` must equal the path length from the source to `current` along `parent` when there is one, else the sum of the chosen `w` (`total.of: "path"` or `"taken"` overrides; `total.check: false` skips). A total written with more decimals than `w` may differ by edges × ½·10^−(w decimals).
- Colours: current `--emph` thick ring, frontier `--accent2` dashed ring and the bottom row, visited `--muted` fill, chosen edges and the search tree (arrows) `--term`, other edges `--line`.
- Timing: drops fade in half of `dur`, takes draw one by one in order; node states change in half of `dur`; the total counts up.
- Caps: 24 nodes, 60 edges, 40 steps. Overlapping nodes, no room for a weight or a long note report layout; a small element reports size. No answer preview.
<!-- llm: end -->
<!-- llm: omit -->
Notes: keep node names short (1–3 characters); use `take` for a path or tour and `parent` for a search tree, not both in one step.
<!-- llm: end -->
