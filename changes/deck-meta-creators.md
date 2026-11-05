### Added

- `deck-meta` carries `creators` (spec §4, egatari-spec b150f59), copied from `metadata.creators` like `license`, `copyright` and `attribution`, so a play-only file keeps them; omitted when there are none and checked against the schema. A working-folder build now writes the same four into its `deck-meta`
- Player: the key list (`?`) shows the lesson's **File info** (title, created by, copyright, license, attribution; spec §7.3) from `deck-meta`, falling back to the index's `metadata` for files exported before this change
- Book: `:::{table}` with `:class: row-headers` (spec §9C.6, egatari-spec bc0fd0d) makes the first cell of each body row a row header (`<th scope="row">`), styled like the header row

### Changed

- Book, vertical writing: tables are set from the top of the line (天付き): the table, its caption and body cells start at the top of the column instead of being centred; header cells (the header row and row headers) stay centred in their cells. Horizontal books are unchanged
- Editor and docs: `metadata.creators` is called 作成者 / “Created by” (was 作り手 / “Creators”), the same as the player's File info; added to the terms list
- Format spec copy (`vendor/egatari-spec`): egatari-spec bc0fd0d (main, not a wd-* tag), with the article-text fixture `valid/table-row-headers`

### Fixed

- Player: the key list (`?`) no longer cuts off the Tools column at the right edge of a 1280-wide window or overflows at phone width: the card is up to 1000px wide and the descriptions wrap
