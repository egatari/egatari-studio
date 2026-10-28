### Changed

- Player: the pen colours no longer come from the theme (`--emph`, `--term`, `--fg`). They are fixed: the Colour Universal Design red `#FF4B00` and blue `#005AFF` and black `#000000`, still named Red, Blue and Black (backlog #132). On white they reach 3.4, 5.4 and 21:1 (lines need 3:1), and under simulated colour vision they stay at least ΔE*ab 61 apart; with the theme colours, Blue and Black were ΔE 8 apart in `sumi`.
  `tools/test-themes.mjs` checks the three pens on the ground of every bundled theme. The presenter view sends the new names; points sent with the old names are still accepted. Needs `npm run player:bump` before the 0.6.2 rc.
