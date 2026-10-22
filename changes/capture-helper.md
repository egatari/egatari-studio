### Changed

- Test and inspection screenshots no longer depend on the time between page load and capture: `kit/browser.mjs` gains `stableCapture(page, opts)` (hides the talk-mode control bar and toast, waits two animation frames, captures with `animations: 'disabled', caret: 'hide'`), `prepareForCapture(page)`, `releaseCapture(page)` and `captureUrl(url, mode = 'video')`. `tools/shot.mjs`, `smoke.mjs`, `sheet.mjs`, `comment-shots.mjs`, `flake.mjs` and the seek-determinism checks use it; new `tools/test-capture.mjs` checks that a talk-mode capture at 0.5 s and 3 s after load is identical
