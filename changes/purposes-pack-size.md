### Changed

- Instructions for the AI: pack version `2f046ca0` → `88ecfc51`. The R-purpose table is generated from the vendored parts: each purpose lists the parts that serve it (with their pack); a purpose with no part yet says to use the nearest part, or HTML or inline SVG (no `*` markers, and no part that is not vendored is ever named); a last row lists the parts no purpose uses. The table replaces the separate list of all parts (same pinned link). Steps come from the components manifest when it has them.
- Instructions for the AI, smaller (en all 61.7 → 55.9 KB, ja all 62.9 → 57.1 KB): the worked example of each series pack shows only the slides that use its part (the full skeleton stays in the common example), a component's data example is left out where its README or the series example already shows it, “child JSON” lines that repeat the data shape column are cut, two internal notes of `m-gendai` and `m-kobun` are cut or shortened, and sentences that repeated R-components in the academic and business packs refer to it instead. Standards and their meaning are unchanged.
- Purposes use the ids of the components' `purposes.json` (`part-whole`, `key-number`, `cause-effect`, `correlation`, …). With a manifest that lists purposes, the New… tiles follow its order and leave out reserved ids; component `variants` are read too.
- `npm run components:update` keeps the release `manifest.json` in `vendor/components/` (its sha256 in `components.lock.json` as `manifestSha256`; `components:check` verifies it), so purposes and variants are read offline. The v1.1.0 manifest is vendored.

### Fixed

- Editor app, New…: the small text of a purpose tile wraps instead of being clipped (checked at widths 360–1280 px in Japanese and English).
