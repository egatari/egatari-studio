### Added

- The quality check accounts for every one of its items (`kit/core/check-rules.mjs`): the authoring standards `R-*` and the checker's own families `C-*` (build, slide ids, vocabulary, template text, fonts, links, audio, attachments, book, accessibility, morphs, reproducibility, listings), 29 in all, and every finding's code belongs to exactly one of them. Each item ends `checked`, `failed` (it has an error), `excused` (it does not apply to this lesson, with a reason such as `noNarration` or `noBook`) or `skipped` (this run could not look at it: `noBrowser`, or `notInEditor`). `node kit/check.mjs --json` adds `status`, `ruleSet`, `rules` and `summary`; an item left in no state, or a code in an excused or skipped item, makes the check `"status": "incomplete"` with exit code 3, so a run that did not look at everything is never read as a pass. The text output and the editor's quality check panel end with one line, 「品質チェックの項目：見た 24・当てはまらない 5・…（29 のうち）」; the editor reports the same items and marks the command-line-only ones as not run here
- A lesson with one known defect per item (`tools/fixtures/seeded-defects/ja`): `tools/test-seeded-defects.mjs` checks that the quality check catches all of them (29/29) and nothing else

### Changed (API)

- `node kit/check.mjs --json` has four new top-level fields: `status` (`"ok"`, `"incomplete"` or `"crashed"`), `ruleSet`, `rules` (each `{id, kind, state, reason, counts, codes}`, where `reason` is `null` unless the item is excused or skipped) and `summary`. Exit code 3 means incomplete
