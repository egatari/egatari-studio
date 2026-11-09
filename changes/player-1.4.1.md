### Fixed

- Egatari Player 1.4.1 (the bundled player that files carry, `player` in the index and `deck-meta`): patch release. The axis chart helper (`DECK.Plot`, used by `m-sweep` and other plotting parts) no longer writes a clip rectangle with a negative width or height when a part is mounted before its box has a size (for example while the editor's preview is being replaced). Browsers logged this as an invalid SVG attribute; the chart itself was not affected

### Added

- Egatari Player 1.4.1: an embedded lesson (`?embed=1`) now sends `{egatari:"ready", version, docId, sourceSha256?, timeline}` to the host once it has loaded and can take commands (Player P8), before the first `position`. Hosts no longer need to wait for `position` before sending commands
