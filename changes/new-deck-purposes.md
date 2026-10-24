### Added

- Editor app, **New…** has six steps (backlog #99): **1. the kind**, a category (Teaching, Research, Business, Guides, Other; “Academic” is gone) and a subcategory that sets the structure template (10 subcategories; Guides has a structure of its own), added to the request with its structure and presentation; **2. subjects and purposes**: subjects are part sets (Math and statistics, Business, Japanese language arts, Information science), the materials Table, Image, Equation and Shape are always available, and 14 purpose tiles are all on by default. A tile turned off tells the AI not to use those representations and leaves the parts used only for it out of the copied catalog (`kit/core/purposes.mjs`, `kit/core/new-deck.mjs`). Purposes are read from the components' `manifest.json` when it has them, otherwise from the decided table.
- Lesson seed (format spec §8.4): **New…** writes `data-egatari-seed` (a random decimal uint32) once on the `<html>` of `deck.html` when the lesson is created and records the choices in `egatari.json` as `studio.newDeck` (through `updateConfig`); **Revise…** and on-slide edits (editor app and dev server) put the earlier seed back if the new source dropped or changed it. The build and the single file keep it.

### Changed

- Instructions for the AI: pack version `e43dedc5` → `2f046ca0`: new §2.7 with **R-purpose** and the purpose → representation → steps table (parts-map §10; parts not in the library yet are marked *), **R-whole** (lists, KPI cards and pies are shown whole unless the narration discusses each item), and a one-line index of all parts with their pack and a pinned link to the components' READMEs in §3. Fitting the slide is now §2.8. `m-curves` and `m-quad` stay in their packs until components v1.2.0.
- `egatari.json` `studio.outline` (long lessons) is written through `updateConfig`, so other members stay byte for byte; a file that is not a JSON object is refused instead of overwritten.

### Changed (API)

- `assemble(data, {series, lang, exclude})` (`kit/core/llm-pack-assemble.mjs`), `commonBody(lang, exclude)`, `seriesPart(name, lang, exclude)` and `packWithRequest({…, exclude})` take an optional `exclude` list of component tags left out of the catalog; without it the output is unchanged.
