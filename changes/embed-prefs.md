### Added

- Embedding (Player P5, P8): the `prefs` command applies the viewer's preferences a host kept (layout, the book's text size and background, captions and their size) and replies with those in effect; the player sends a `prefs` event when the viewer changes one with its own controls. `ready` now carries `formats`, `player` and `commands`.
- Egatari Viewer keeps those preferences (the layout per file, the others for the device; not on a shared device) and sends them back when a file is opened again.
