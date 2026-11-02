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
