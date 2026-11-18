# m-network changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.1.0 (components 2.12.0)

- Graphical models and path diagrams (additive; existing lessons paint the same pixels):
  - node `shape` `circle` (default), `ellipse` (a latent variable) or `box` (observed);
  - `observed: true` shades the node (the convention of graphical models);
  - `bi: true` on an edge draws it dashed with arrowheads at both ends (latent confounding);
  - `plates: [{nodes, label}]` draws a rounded rectangle around those nodes, with N in its lower right corner.
- `layout: "trellis"` with `states`, `T` and `transitions` lays out an HMM trellis (states × time, ids "state@t", "t = 1…T" above the columns) without coordinates.
- Node labels and notes take mtext markup (`*x*_i`); labels and notes without markup are drawn as before.
- Same pixels as 2.0.0 for every existing lesson (same-paint against v2.11.0, the four 2.0.0 demo slides, 4 themes). The demo adds a path diagram, a plate and an HMM trellis with its Viterbi path (tools/network-demo.py).

## 2.0.0 (components 2.10.0)

- New part: graph search and tours, in a new set `algo` (アルゴリズム / Algorithms). Nodes at author coordinates, edges with optional weights and direction. Each step sets the current node, visited nodes, the frontier (shown also as a queue, stack or priority queue row), search-tree parents, and takes or drops chosen edges (drawn end to end, with arrowheads in a directed graph); a running total counts up. Self-loops are drawn outside the node, away from its other edges; opposite directed edges are drawn as two arcs; `stochastic: true` checks that each node's outgoing weights sum to 1 (Markov chains). Checks unknown ids, missing edges and bad drops, and that the total matches: the path length to the current node along the parents when there are parents (a search), otherwise the sum of the chosen edges' weights (a path or tour); `total.of` sets it explicitly, and a total written with more decimals than the weights may differ by the rounding of the weights.
