### Fixed

- `index.themes[].version` is always the theme's own version, never Studio's (format spec §3.8, §6): `kokugo` and `business` are 1.0.0 in
  `themes.lock.json` with the hashes lessons already recorded (their files are unchanged), and a user or lesson-local theme without a `version` in
  its `theme.json` is recorded as `"local"` with `source: "embedded"` and identified by its sha256 when rebuilt. Before, these themes recorded the
  Studio version (e.g. `0.4.7`), and user themes were not recorded at all. `npm run themes:check` now requires every bundled theme to be in the lock
- The single file's `egatari.json` `themes` now pins exactly the entries of `index.themes` with their versions, including the parent of a theme
  that `extends` another and `"local"` themes (before, only themes pinned in `themes.lock.json` were listed)
