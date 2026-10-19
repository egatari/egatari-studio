### Changed

- Build: every output (plain build, dev and preview, single file, play-only) copies the audio record's `kind` (`tts`, `recorded`,
  `imported`) into `deck-audio` (format spec 05c577f); the player reads it first and falls back to the index records
- Player: imported audio is marked "Audio of unknown origin" / 「由来の分からない音声」 (format spec §7.3); the TTS label reads
  "This narration is AI-generated" / 「この語りは AI で合成しています」
