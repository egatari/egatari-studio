### Changed

- Japanese and Chinese text no longer starts a line with a small kana (ゃ, っ, ァ …), a long vowel mark (ー), a closing bracket or a punctuation mark (`line-break: strict`, format spec §8.0). This now applies to horizontal slides, captions, the presenter view's script and components, as it already did to vertical slides. Some line breaks on existing Japanese slides can move; the quality check gives the same results on the bundled examples. `……`, `――` and runs of digits were already never split
