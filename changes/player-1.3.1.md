### Fixed

- Egatari Player 1.3.1 (the bundled player that files carry, `player` in the index and `deck-meta`): patch release after 1.3.0 (in the release candidates only), found on an iPad mini:
  - vertical text (`.tate`) in a horizontal slide wraps into columns inside the slide on iPad and in Safari (WebKit took its `height: 100%` from the window, so the column ran past the slide's bottom in the small slides of Read with script and in Watch on slides);
  - in the Book layout the step follows the line just below the slide that stays at the top, where the reader is reading; before, the line was behind that slide, so the script went under it and the slide lagged up to three steps;
  - on touch screens the divider between the slides and the book or script can be grabbed 18 px on either side of the line (44 px in all); the line looks the same.
