### Added

- Editor site: every release from v0.4.1 on stays at its own URL, `/vX.Y.Z/` (e.g. https://studio.egatari.org/v0.4.2/), and the root
  serves the latest. A frozen copy shows which version it is with a link to the latest; the root lists the versions (#32)
- `tools/site-versions.mjs`: builds the release asset `editor-site-vX.Y.Z.tar.gz` from a tag, verifies it against the sha256 line
  in the release notes, and assembles the Pages site from the new build and the earlier releases' assets

### Changed

- Browser TTS: only the latest editor (the site root) removes caches of other model revisions; frozen copies keep them
