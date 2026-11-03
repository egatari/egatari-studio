### Added

- Editor app: a sample on the first screen plays large; **Make one like this sample** opens New… with its setting, theme and parts marked “From the sample”,
  only step 2 empty, and adds the sample's structure (heading and point per slide) to the instructions; `?from-sample=<name>` opens the same (backlog #130)
- `examples/<name>/sample.json` (request, setting, theme, parts, structure, book, language, rights), checked by the build; `studio.newDeck` records `fromSample`
- `node kit/llm-pack.mjs --from-sample <name> [--request …]` prints exactly the instructions the editor copies for that sample (shared `kit/core/new-deck-pack.mjs`)
- New… from a sample: the sample's parts keep their full descriptions on the free plan; over the limit, the other core parts are shortened first,
  then specialized parts the sample does not use are left out, and only last the sample's own parts are shortened (`fitSample`, editor and command alike)

### Changed (API)

- `buildPack`, `assemble` and `packWithRequest` (and `partsPackOpts`) take `full`: on the free plan, the standard parts described in full (default the core four; `short` means none). New `fitSample` (`kit/core/llm-pack.mjs`) fits a New… from a sample in the order above
