### Added

- Quality check: a new R-fit warning `colOverflow` (command line and editor) when content of a side-by-side column (`.cols`), such as a long KaTeX fraction, is wider than the column and covers the next one; it names the column, the column it runs into and the formula as written, and says to shorten it, put it on its own line outside the columns, or use fewer columns (handoff Issue #40)

### Changed

- Quality check: when a part reports values outside the range it shows (`ctx.report("range", …)`), the `compReport` warning now says to set the part's range attributes (such as `xr` and `yr`) so that every value fits (handoff Issue #40)
