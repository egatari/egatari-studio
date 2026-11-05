### Added

- Editor: the first screen has a small link **All parts** (パーツの一覧) after the samples. It opens the parts page `/parts/` in a new tab (relative to the site root; from the offline editor opened from disk, <https://studio.egatari.org/parts/>)

### Changed

- New… step 4 takes part names from the `display` field of the default parts library manifest (copied by `npm run gen`; `npm run gen:check` compares them). Only parts without a `display` keep a local name in `kit/core/part-labels.mjs`. Renamed: `m-codetree` 符号の木 → ハフマン木, Code tree → Huffman tree. The instructions for the chat AI do not change
