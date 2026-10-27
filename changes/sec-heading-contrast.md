### Fixed

- A chapter divider (`<section class="slide sec">`) whose title was written with `<h2>` was unreadable: the `h2` kept the colour of ordinary slide titles on the divider's ground. `.sec h2` is now styled like `.sec h1` (#128).

### Added

- The quality checker warns about a chapter divider with an `<h2>` and no `<h1>` (`secHeading`: the title of a divider is `<h1>`), and about heading or body text whose computed colour has less than 4.5:1 contrast with the background behind it (`textContrast`, one per slide; never over images or gradients). Both are warnings, in the command line and the editor.
- The AI instructions describe the chapter divider: `<section class="slide sec noconcl static"><h1>…</h1></section>`, and R-headings says dividers use `h1`.
