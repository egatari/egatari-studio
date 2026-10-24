### Changed

- Theme `default` 1.1.0, `--emph` #C50516 → #BE3012: the orange-leaning red that CUD guidance recommends for P/D-type colour vision, darkened to text strength (5.80:1 on white, WCAG AA); protan ΔE00 to the ink 22.5 → 26.0.
  The previous crimson leaned bluish, which CUD advises against, and was never a deliberate choice. `--emph-tint` follows; `kokugo` keeps its own red. Reasons: `themes/default/README.md`.
- Theme `default` 1.1.0, `--muted` #6E6E6E → #5C5853: 5.10 → 7.06:1 on white (WCAG AAA level), for projectors and small text. `kokugo` inherits the new grey.
  Trade-off: muted–ink ΔE00 25.6 → 18.2, acceptable because muted text also differs from the ink by role and position.

### Added

- Theme versions, as for components: `themes/<name>/theme.json` has a `version`, earlier versions stay in `vendor/themes/<name>/<version>/` and `themes.lock.json` lists their hashes and changed colors (`npm run themes:check`, in `npm test`).
  A lesson that recorded `default` 1.0.0 keeps it: the build warns `theme pinned: …` with old → new colors, `--update-themes` updates it, and the editor shows the colors with swatches and offers **Update theme**. Single files pin `themes` in their `egatari.json`. Documents at a theme's root (`README*`, `LICENSE*`, `*.md`) are never read or hashed; the `LICENSE*` of a user or lesson-local theme travels in the single file.
