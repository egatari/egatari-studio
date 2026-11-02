### Changed
- Tests: browser tests whose child processes each launched a browser (`kit/check.mjs` per component demo, `kit/abcjs-node.mjs` per score, `tools/sheet.mjs`) start one browser for the whole test (`shareBrowser()` in `kit/browser.mjs`). test-app's preview audio checks are their own serial step, test-app-audio, so macOS CI runs `npm test -- --jobs 2`.

### Fixed
- `node tools/test-all.mjs --help` prints the usage instead of running every test, and `--only` with names that match no step says so and exits 1 (it crashed at the summary table).
- test-parts-host waits for autoplay to advance after shortening the step, instead of a fixed 80 ms (failed on slow macOS CI).
- test-app waits for the theme folder notice before reading it (it read the previous notice when steps ran in parallel).
