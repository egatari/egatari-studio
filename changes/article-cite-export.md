### Added

- Book citations (format spec §9C.4): the build formats `[@key]`, `[@key, p. 3]`, `[@a; @b]` and `@key` with the Citation Style Language
  and writes the reference list; `egatari.json` `metadata.citations` picks the style (`apa`, `ieee`, `sist02`; another name falls back to
  `apa` with a warning) and the list (`end`, `chapter` with ids `ref-<chapter>-<key>`, `none`); uncited works are reported
- Links between slides and book sections (§9C.5, §9C.7): `npm run ids` records new links in `egatari.json` `articleLinks`, `check` says
  "slides and book may not match" when either side changed since, and `npm run ids -- --confirm-links` records that they agree again
- The Egatari file (.ega.html) carries the book (§9C.1, §9C.6): chapter files, `references.json` and images in the archive,
  `index.article` and `index.articleLinks`, and the rendered book as `#egatari-article` at the end of the readable layer; `unpack` writes
  the reading order into `egatari.json`. A book with errors is not exported; sections without an id get one. Tier A edits keep the book
- `npm run portable -- pack` opens the written file in the player and refuses a book whose step links point to a slide or step that
  does not exist (`articleStep`, as `check` reports it; §9C.8)
- `check` warns about an HTML table in the book that merges no cells (`articleHtmlTableNoSpan`: a pipe table would do, §9C.8)

### Changed

- Dependencies: `citeproc` 2.4.63 (citeproc-js, used under CPAL-1.0 from its CPAL-1.0+ OR AGPL-3.0+ choice; build only, not in any output), and the CSL styles `apa`, `ieee`, `sist02` and
  the `en-US` and `ja-JP` locales (CC BY-SA 3.0) in `vendor/csl/`
