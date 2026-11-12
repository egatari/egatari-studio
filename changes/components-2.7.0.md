### Changed

- Components 2.0 lessons use egatari/components **v2.7.0** by default. The parts' own notes in the AI instructions now use the glossary words (パーツ, 台本, ステップ instead of 部品, 口述原稿, 段階), so the part notes and the rest of the instructions say the same thing. `base` 1.2.0 adds the colour ramp (`--ramp-1` … `--ramp-5`, `rampStops`); `m-heatmap`, `m-map-japan` and `m-map-world` 2.1.0 draw their shades from it; `m-code` 2.1.0; `m-predict` 2.1.0 adds `labels.correct` and shows its own words in the lesson's language. Every other part is a patch release that needs `base` 1.2.0. No part was added or removed
- The parts proposal heading in the studio skill reads 「ステップと最終状態」 (“Steps and final state”), as in the components proposal form
