### Changed

- Build: every output (plain build, dev and preview, single file, play-only) copies the audio record's `kind` (`tts`, `recorded`,
  `imported`) into `deck-audio` (format spec 05c577f); the player reads it first and falls back to the index records
- Player: for imported audio the key list and the presenter view say "How the audio was made is not recorded" /
  「音声の作り方は記録されていません」 (format spec §7.3); nothing about the audio is shown on the slide or with the captions

### Fixed

- Player: captions no longer sit under the control bar; while the bar is shown over the bottom edge they move up above it
