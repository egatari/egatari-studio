### Changed (API)

- `DECK.VERSION` is the version of the running player: `player.version` in `deck-meta` (format spec §4.1), `generator.version` for a file from before 1.0, and Studio's version in a plain build. The new `DECK.MADE_WITH` is `generator.version`. **Send feedback** fills `version` with the player's version and adds `made=<Studio version>` to the context when it differs.
