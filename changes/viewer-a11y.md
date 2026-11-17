### Added

- Viewer: `tools/test-viewer-a11y.mjs` runs axe-core (WCAG 2.2 AA rules) on the Viewer's page in twelve states, in Chromium and WebKit, as part of `npm test`; the lesson's frame is listed but does not fail it. axe-core 4.14.0 is a new dev dependency.

### Fixed

- Viewer: the Live join screen (before 参加する) lay on the dark stage with dark text and was barely readable in the light theme; it now has the page's background.
