### Added

- Quality check (command and editor): text inside an element with `data-annot` (a deliberately small annotation, such as the reading-order numbers of `m-kanbun`) is not reported as too small (`smallText`, `smallSvgText`). The attribute name lives in `ANNOT_ATTR` (`kit/core/layout-scan.mjs`); [contract §10](docs/contract.md#10-quality-check-intended-clipping) is its rule. The mark only counts when a component sets it at mount; the player removes every `data-annot` written in the deck's own markup first. No other check and no rendering changes.
