### Changed

- Theme `default` 1.1.0: `--emph` (conclusions, problems) #C50516 → #BE3012, a vermilion-leaning red: under protan simulation it stays apart from the body text (CIEDE2000 to the ink 22.5 → 26.0), still 5.8:1 on white.
  `--muted` (known results, captions, citations) #6E6E6E → #5C5853, 5.1:1 → 7.1:1 on white, so small grey text stays readable in a bright classroom. `--emph-tint` follows. Nothing else changes; `kokugo` keeps its own red and takes the new grey.

### Added

- Theme versions, as for components: `themes/<name>/theme.json` has a `version`, earlier versions stay in `vendor/themes/<name>/<version>/` and `themes.lock.json` lists their hashes and changed colors (`npm run themes:check`, in `npm test`).
  A lesson that recorded `default` 1.0.0 keeps it: the build warns `theme pinned: …` with old → new colors, `--update-themes` updates it, and the editor shows the colors with swatches and offers **Update theme**. Single files pin `themes` in their `egatari.json`.
