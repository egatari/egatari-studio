### Added

- `deck-meta` carries `creators` (spec §4, egatari-spec b150f59), copied from `metadata.creators` like `license`, `copyright` and `attribution`, so a play-only file keeps them; omitted when there are none and checked against the schema. A working-folder build now writes the same four into its `deck-meta`
- Player: the key list (`?`) shows the lesson's **File info** (title, created by, copyright, license, attribution; spec §7.3) from `deck-meta`, falling back to the index's `metadata` for files exported before this change

### Changed

- Book, vertical writing: tables are set from the top of the line (天付き): the table, its caption and body cells start at the top of the column instead of being centred; header cells and a first column of bold labels stay centred in their cells. Horizontal books are unchanged
- Format spec copy (`vendor/egatari-spec`): egatari-spec b150f59 (main, not a wd-* tag)
