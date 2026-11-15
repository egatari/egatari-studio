# m-network changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.10.0)

- New part: graph search and tours, in a new set `algo` (アルゴリズム / Algorithms). Nodes at author coordinates, edges with optional weights and direction. Each step sets the current node, visited nodes, the frontier (shown also as a queue, stack or priority queue row), search-tree parents, and takes or drops chosen edges (drawn end to end, with arrowheads in a directed graph); a running total counts up. Self-loops are drawn outside the node, away from its other edges; opposite directed edges are drawn as two arcs; `stochastic: true` checks that each node's outgoing weights sum to 1 (Markov chains). Checks unknown ids, missing edges and bad drops, and that the total matches: the path length to the current node along the parents when there are parents (a search), otherwise the sum of the chosen edges' weights (a path or tour); `total.of` sets it explicitly, and a total written with more decimals than the weights may differ by the rounding of the weights.
