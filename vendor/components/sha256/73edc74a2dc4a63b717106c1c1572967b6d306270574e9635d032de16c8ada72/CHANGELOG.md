# m-matrix changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.0 (components 2.18.0)

- For the ways fields position a study (handoff #71). cross: `{"self": "one sentence"}` writes this work's finding under 本研究 in its cell; `design` adds rows under the table (earlier work's design of the data or identification against this work's, and what it made possible), this work's row framed. attributes: a column may be `{"name", "source"}`, the source muted over the name; `marks` explains the symbols under the table, on one line when short. Wrapped text breaks after a particle or 、 and is balanced. Data written for 2.0 draws as before.

## 2.0.0 (components 2.17.0)

- New: a comparison matrix for positioning a study (handoff #64). `kind: "cross"` (default) is the cross of two axes, with study names in the cells, this work's cell written out and framed, empty cells shown as — with a note under the table, and a third axis as marks after the names; steps go axes → studies → this work → notes. `kind: "attributes"` is studies × elements with short text, by column, by row or whole, and this work's row framed at the last step. The readable table writes headers as "axis: value".
