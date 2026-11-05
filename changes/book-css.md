### Fixed

- Player, book: the book pane (`book` and `split` layouts) is isolated from a slide theme's element rules. Its elements are reset with `all: revert` at ID specificity before the book's own styles, so a theme's bare `table{font-size:28px}`, `li`, `p`, `code`, `figcaption`, `h2`, `rt`, … no longer reach `#egatari-article` (tables were 28px in an 18px book). The book in the player now matches the standalone `deck.article.html`; table cells are start-aligned
- Slide layout (`kit/layouts.css`): the element rules `table`, `th`, `td`, `td.r`, `rt`, `svg text`, `svg .mi`, `.katex` and `.katex-display` apply inside `.slide` only (`:where(.slide)`, same specificity; slides look the same and themes still override them)

### Changed

- Book, vertical writing (spec §9C.6, egatari-spec a72e440): tables are vertical too (`writing-mode: vertical-rl`: each row is a column, the first row on the right, cells top to bottom; 1–2 digit numbers in cells upright), on screen and in print. This replaces the horizontal tables with right-to-left columns (`direction: rtl`). Figures, display math and code stay horizontal
- Book: `:::{table}` takes `:class: <names>` (spec §9C.2), written as `egatari-table-<name>` on the table's figure; `horizontal` keeps a table horizontal in a vertical book. `check` reports a malformed name as `articleTableClass`
- Format spec copy (`vendor/egatari-spec`): egatari-spec a72e440 (main, not a wd-* tag), with the article-text fixture `valid/table-class`
