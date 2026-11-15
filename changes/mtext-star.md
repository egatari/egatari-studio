### Fixed

- `DECK.mtext` (the player's small SVG text markup for older parts and hand-written SVG) follows the parts library's base 1.2.0 rule for `*` (backlog #199): `*` italicises only as a pair with non-space just inside, as in markdown, so labels such as `A* 探索`, `5*3` and `注*` stay as written instead of turning italic; `\*`, `\_` and `\^` draw the character itself. Sub- and superscripts keep their size. Changes the bundled player (bump at the next rc). `tools/test-deck-mtext.mjs`
