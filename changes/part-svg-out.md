### Added

- Quality check: a new R-fit warning `partSvgOut` (command line and editor) when the `<svg>` directly inside a part element sticks out of the element's box by more than 2px, as happens with a working-folder part whose root `<svg>` has no width and height; the studio skill's part-writing section now says to give it a width and height (or `width:100%;height:100%`) (backlog #208)
