# m-particles changelog

## 2.0.2 (components 2.8.0)

- Hardening: an m-particles element narrower than about 45 px no longer hangs the page (only an author's own layout can make it that narrow; Studio's panes and windows can't). The solid lattice keeps at least one column; it looped forever with a negative column count.
- The layout box's width and height are at least 0, so a container too small for it draws no negative-size rectangle.

## 2.0.1 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.0 (components 2.4.0)

- New science part: fixed-count, fixed-size particles for states of matter, with deterministic arrangements and static motion marks.
- Chemical reactions preserve atom identity while separating and regrouping molecules; final diagrams retain the reactants as a labelled reference, the equation and per-element counts.
- Validate formulas, conservation and size limits without correcting reaction data. Unbalanced reactions show a reported static comparison.
- Visual review: larger particles, floor-aligned solid rectangles and non-overlapping liquid layers, deterministic scattered gas positions, collision-free motion marks and one-line transition captions. Larger reaction atoms, clearly separated intermediate atoms, centered compact figures and count sentences, top captions and no duplicate final label.
- Japanese/English labels, final-state accessible names and preview exemption for classroom prediction.
