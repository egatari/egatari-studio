### Fixed

- Editor, AI paste (Revise…, Replace): the quality check after the rebuild now waits as long as the build may take (its 60 s limit plus 20 s) for the preview. On a slow computer the rebuild and the preview took more than the 20 s it waited before, and the check was skipped without a word (no panel, no result)
- Viewer: a new version no longer takes over while a chosen file is being read and checked. Only a lesson that had started counted before, so a takeover in that moment reloaded the page and the file did not open
- Quality check (command and editor): the contrast check reads `rgb()` colours directly instead of through a canvas (canvases are now CPU-backed, `willReadFrequently`). On a busy macOS CI runner every colour once read as 0,0,0, so every pair was reported as 1.00:1 `contrastLow`

### Changed

- CI (`.github/workflows/test.yml`, `RELEASING.md` step 3): macOS runs the full `npm test` only for a push to `main`, a `v*` tag, and a dispatch with `full=true`; other runs there run the platform-sensitive set (`npm test -- --platform`) and the clean environment in one job. Linux and Windows are unchanged. Playwright WebKit is installed on macOS, so the WebKit tests run there
- Tests: `npm test -- --platform` runs builds, checks, unit tests and the tests marked `// test-all: platform`; `TEST_TIMEOUT_SCALE` multiplies every wait's cap (`tools/wait-scale.mjs`, Playwright's default in `kit/browser.mjs`, the step cap); on machines with under 12 GiB the memory-heavy steps never overlap (`TEST_HEAVY_ALONE`); the summary prints the lowest free memory and the swap growth. `--only` now also runs the builds a step's arguments need
