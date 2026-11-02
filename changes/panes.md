### Added

- Player: three layouts, **Slides**, **Slides and book** and **Book** (Player P2), chosen with **View** or `r` and remembered on this
  device; `?layout=slides|flow|split` and the embedding message `{egatari:"layout"}`; `metadata.primary: "read"` opens the book. The book
  is the lesson's article; without one, **Read with script** shows each slide small with its steps' script
- Player: the slides and the book follow one position (scrolling the book moves the slides, also in vertical writing), with a rule
  marking the current part; during autoplay the book follows until you scroll it, then **Back to the playing part** brings it back
- Player: **Read in the book** on a slide with a section, **Watch on slides** in the book (the slide over the book with its motion;
  ← / →, Esc returns to the place you were reading), a resizable divider, and steps that play once as they scroll into view in
  Read with script (final states with reduced motion)
- Build: the folder build puts the book into the built lesson (`#egatari-readable`, format spec §9C.6) for the player, with its glyphs

### Changed

- Player: `?mode=learn` now opens **Slides and book** (**Slides and script** without a book) on wide screens and the book alone on
  narrow ones (Player P2 defaults); before, it opened the slides alone. `?layout=slides` or the layout chosen on the device keeps the slides
- Book: in vertical writing, numbers the build writes (headings such as 「第 4 章」 and 「1 春の朝」, captions, cross-references, equation
  numbers) set a run of one or two digits upright, as in the text; 「1.2」 stays rotated whole (format spec §9C.6)
