# m-matrix changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.17.0)

- New: a comparison matrix for positioning a study (handoff #64). `kind: "cross"` (default) is the cross of two axes, with study names in the cells, this work's cell written out and framed, empty cells shown as — with a note under the table, and a third axis as marks after the names; steps go axes → studies → this work → notes. `kind: "attributes"` is studies × elements with short text, by column, by row or whole, and this work's row framed at the last step. The readable table writes headers as "axis: value".
