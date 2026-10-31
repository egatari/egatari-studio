### Changed

- Egatari Player 1.1.0 (the bundled player that files carry, `player` in the index and `deck-meta`): minor release. It hosts the Components 2.0 parts' context (`ctx.extend` for viewer time extensions, clamped so no step runs below zero remaining time or past one hour; `ctx.live`, dormant: `poll()` returns null and nothing shows live counts yet), plays part sounds in talk and learn with a toolbar mute, takes viewer input from the presenter view (#110), and keeps recording mode silent. Files from earlier versions keep their own player.
