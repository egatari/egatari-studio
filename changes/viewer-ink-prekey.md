### Fixed

- Egatari Viewer: a handwriting stroke drawn just after opening a lesson, before the player has said which slide it shows, is no longer dropped; it goes onto that slide and is kept. `tools/test-viewer-ink.mjs` draws before the slide key arrives, and waits for the surface to be painted before drawing instead of drawing again.
