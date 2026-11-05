### Fixed

- Egatari Player 1.3.1 (the bundled player that files carry, `player` in the index and `deck-meta`): patch release after 1.3.0 (in the release candidates only), found on an iPad mini:
  - vertical text (`.tate`) in a horizontal slide wraps into columns inside the slide on iPad and in Safari (WebKit took its `height: 100%` from the window, so the column ran past the slide's bottom in the small slides of Read with script and in Watch on slides);
  - in the Book layout without a book (Read with script), the small slides no longer stay fixed over the text: each shows its slide's final state and scrolls with the script like a figure, and scrolling the script no longer plays steps, so the script is never hidden behind a slide (before, the slide was pinned at the top and the script slid under it). Tap a small slide to open it in Watch on slides; during playback the playing slide stays live on its card and the text follows it (with reduced motion, each step's final state);
  - on touch screens the divider between the slides and the book or script can be grabbed 18 px on either side of the line (44 px in all); the line looks the same.
