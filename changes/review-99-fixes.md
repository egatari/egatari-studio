### Fixed

- Instructions for the AI (pack `88ecfc51` → `ff02abc6`): a purpose turned off in New… no longer leaves its parts anywhere in the copied text. The R-purpose table is now made when the text is assembled (`kit/core/llm-pack-assemble.mjs`): rows of purposes that are off are left out, excluded parts are dropped from the other rows, and worked-example slides, narration sections and sentences tied to a part (`<!--part:m-x-->` in `tools/llm-guide/`) are dropped with it. A test checks every single purpose and every pair across all pack combinations.
- The R-purpose table names only parts whose description is in the copied text: parts of packs that are not included are left out of the rows, and one line says which purposes those packs would serve (without naming their parts). Rows with no part say to use the nearest part, or HTML or inline SVG.
- New…: `studio.newDeck` records the choices as they were when the instructions were last copied.
- Reading the components manifest: bad purpose entries are dropped one by one with a warning (`npm run gen`) instead of silently shrinking the list; `reserved` is any truthy value; a component without `tag` is `m-<dir>`; a `manifest.json` that is not JSON falls back to the decided table with a warning; only vendored parts are named in the “do not use” line.

### Changed

- New…: the purpose tiles are always the 14 decided ones (parts-map §9). The manifest's purposes are mapped onto them: `ranking` goes into Compare, now labelled 比べる（量・特徴） / Compare (amounts, features); ids without a tile (`text-structure`, `parameter`, `grouping`, unknown ones) make no tile and are reported by `npm run gen`.
- School lesson presentation adds 国語は縦書き、隠して音読 (parts-map §7).
- One size target for the generated pack: `LIMITS.allTarget` (59 KB, `tools/make-llm-guide.mjs`), used by the test.

### Changed (API)

- `assemble(data, {series, lang, exclude, off})`, `commonOf(data, lang, exclude, series, off)` / `commonBody(lang, exclude, series, off)` and `packWithRequest({…, off})`: the common body's purpose table depends on the included series (default: none, as in `docs/authoring-with-llms.md`) and on the purposes turned off. `partSpans(text, exclude)` drops text tied to excluded parts.
