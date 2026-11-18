### Added

- Quality check: a shape marked `data-within="name"` must stay inside the frame marked `data-frame="name"`. Only declared shapes are measured, by their rendered outline at every step of the slide, so a shape that sticks out only at a middle step is found too. The new R-geometry warning `geoOutsideFrame` (command line and editor) names the shape, the step, by how many px it sticks out, and the other steps where it is outside; the AI fix request carries the same. The value is one name (`[a-z][a-z0-9-]*`); any other value is not measured and gets the R-geometry warning `geoBadMarkName` (command line, editor and AI fix request), once per element, naming the element and the value, so a typo does not silently turn the check off (handoff Issue #46)

### Changed

- Quality check: R-geometry measures `<circle>` boxes by their shape; an edge may name a point (`data-part="mark"`) as an end, and is then not checked against that point's label or the box that holds the point; `data-overlap="ok"` on a marked element or an ancestor `<g>` leaves its overlap findings out (`geoEdgeThroughBox`, `geoLineOverLabel`, `geoLabelOverlap`) (handoff Issue #45); `geoLabelOutsideBox` compares a label with the shape of a `<circle>`, `<ellipse>`, `<polygon>` or `<path>` box, not its bounding box (handoff Issue #46)
