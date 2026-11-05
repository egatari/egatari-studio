### Fixed

- A heading or title that itself contains 「」 is no longer quoted as 「「春暁」を読む」 in the Japanese messages (stale slide/book links from `check` and the editor, the narration and link checks, the build warnings, the editor's slide names and undo lines, and the AI fix and insert requests). The inner 「」 become 『』, giving 「『春暁』を読む」, by one shared helper (`kit/core/quote-ja.mjs`). English messages are unchanged.
