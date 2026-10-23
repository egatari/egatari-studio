### Added

- `npm run sheet -- <deck> --steps` lays out every step of each slide that has a figure or component, side by side (one row per slide), to check a figure's constraints step by step; `skills/motion-slides` now asks for the constraints to be written down first and checked on that strip
- The comments pane says, when a single file (.ega.html) is open, that notes are not saved there and disappear when it is closed
- `docs/distributing`: a table of where a single file runs (and where it does not), and a reminder to give learners the play-only copy

### Changed

- Fix requests (`kit/core/llm-fix.mjs`) now also tell the AI not to use Canvas, slide-making or file features and to reply in the chat body with the two blocks
- Lecture view: steps not yet reached are dimmed to 0.5 (was 0.28), set by the theme variable `--lecture-dim` (default 0.5)
