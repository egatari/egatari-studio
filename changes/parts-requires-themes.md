### Changed

- Builds and portable exports refuse parts with unavailable exact requirements; source checks report `component-requires-missing` errors in English and Japanese. Existing files still open and play the remaining parts.

### Added

- Portable theme index entries include optional `extends` from the child's `theme.json`, alongside a separate entry for the parent theme.
