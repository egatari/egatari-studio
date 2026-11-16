### Changed

- Egatari Player 1.8.0 (the bundled player that files carry, `player` in the index and `deck-meta`): minor release. New `DECK.readableParts()` returns the HTML of the elements marked `data-readable` inside parts at each slide's last state, which the Egatari file export copies into the readable layer (backlog #216). `DECK.mtext` reads `*` with the same rule as the base text (backlog #199). The Live panel and the key help use the established Japanese words (パネル, 接続, 再接続, 回答, ウィンドウ, ツールバー; backlog #223). Slides look the same; playback, steps and timing are unchanged
