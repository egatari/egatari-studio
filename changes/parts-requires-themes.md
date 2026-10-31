### Changed

- Builds and portable exports refuse parts with unavailable exact requirements; source checks report `component-requires-missing` errors in English and Japanese. Existing files still open with their own player and play the remaining parts. A notice names each missing requirement and asks for updated parts to rebuild. Script, audio and timing can be edited and saved without rebuilding (tier A); slide editing, theme switching and replacement are disabled.

### Added

- Portable theme index entries include optional `extends` from the child's `theme.json`, alongside a separate entry for the parent theme.
