### Added

- Quality check: warnings (R-fit) for text cut off by an `overflow` box (`textClipped`), SVG text cut off by its viewBox or going off
  the slide (`svgTextOut`), SVG text overflowing the box drawn around it (`svgTextBox`, e.g. an `m-flow` label) and text outside
  `.body` going off the slide or overlapping the heading, conclusion or page number (`outsideBody`); a slide that already has
  `bodyBottom` does not also get `svgTextOut` for text inside `.body`
- `data-clip` on an element marks intended clipping; the four checks above skip text inside it (contract §10)

### Changed

- Editor app: the browser quality check now runs the same layout code as `npm run check` (`kit/core/layout-scan.mjs`), so it also
  reports the `layout-tate` limits, a conclusion that overflows in height, small text inside SVG and a heading ending with a colon
