### Added

- Edits on a file with an older player (format spec §7.3, handoff #53): when a save without rebuilding (tier A) adds to `metadata.edits` and the file's player does not show edits (Egatari Player before 1.9.0, another player, or none; `EDITS_SHOWN_SINCE` and `playerShowsEdits` in `kit/core/player.mjs`), the editor says so once and offers **Update the player and save** / 「プレーヤーを新しくして保存」, which takes the existing rebuild-and-save path (tier B) with its confirmations. `tools/test-app-old-player.mjs`
