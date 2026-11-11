### Added

- Quality check (`npm run check` and the editor app): a warning `predictAnswerWithCount` (R-steps) when a prediction (`m-predict`) opens its answer at the same step as the vote count, that is `answer-step` 1 or less (read as the part reads it: missing, `0` and non-numbers mean the default 2). The class would see the answer before counting; set `answer-step` to 2 or more. The warning goes into the fix request
- Quality check (`npm run check` and the editor app): a warning `predictAnswerNeverShown` (R-steps) when an `m-predict` has a `steps` attribute below its answer step, so the answer never shows (the player stops a part at its `steps`); set `steps` to `answer-step` or more. It replaces `predictAnswerWithCount` on the same part
