### Added

- Exported copies (format spec §3.1, `exportedFrom`): an export from a working folder (`--portable`, `npm run portable -- pack`, the editor's Export single file) records the folder's source hash in the index (no time, path or name; exports stay byte-reproducible). Editor saves keep it, except Save as new lesson (new `docId`), which drops it; the editor's notice on opening such a file says edits do not reach the folder, offers **Export working folder…** and says when the copy was edited since export. Unpacked folders carry no marker
- `npm run portable -- compare <file> <dir>`: says by source hash whether the exported copy, the folder or both were edited since the export (nothing is merged)
