### Changed
- Embedded fonts are subset to the characters the lesson uses (#178): each `@fontsource` chunk the lesson needs is cut down with harfbuzz (wasm, `harfbuzzjs`) and re-encoded as woff2 (`wawoff2`), with `unicode-range` set to exactly the kept characters. No Python or TTF is needed; output is byte-stable. The rashomon example goes from 12.2 MB to 2.4 MB. Fonts with a Reserved Font Name (Source Sans 3, Source Serif 4, Source Code Pro) are embedded unchanged. `EGATARI_FONT_SUBSET=0` turns it off.

### Added
- `node tools/font-coverage.mjs <built.html>` lists visible characters that no embedded font covers (they render in the device font).
