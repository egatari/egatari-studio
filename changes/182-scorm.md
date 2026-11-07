### Added

- SCORM 1.2 package for LMSs ([binding](https://github.com/egatari/egatari-spec/blob/main/bindings/scorm12.md), backlog #182):
  `egatari build <working folder> --scorm` writes `<lesson title>.scorm.zip`, and the editor has **File ▾ → Export ▸ For an LMS
  (SCORM)…** with a dialog that says what the LMS records and when the lesson counts as completed (`metadata.completion` in plain
  words), then **Download**. The zip holds `imsmanifest.xml` (one SCO, `egatari-<docId>`, the lesson title) and the play-only copy as
  `index.html`, byte for byte what `--play-only` writes. Fixed order and times, no compression: the same lesson gives the same bytes.
  No masteryscore: the player reports completed by `metadata.completion` and sends no score. Refused when `deck-meta.tracking` has no
  `scorm12` or the resume data could exceed 4096 characters (`kit/core/scorm.mjs`)
- A small dependency-free ZIP writer shared by the CLI and the editor (`kit/core/zip-write.mjs`); the AI instructions' skill zip now
  uses it too (same bytes as before)
- Tests: `tools/test-scorm.mjs` (zip layout and determinism, the manifest against the binding's rules, refusals, and the package
  launched in a frame under a parent page with a fake SCORM 1.2 API for each completion rule) and `tools/test-app-scorm.mjs` (the
  export dialog in ja and en, Cancel, the downloaded zip, unsaved changes)
