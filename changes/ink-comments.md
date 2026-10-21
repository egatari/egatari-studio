### Added

- Ink notes in edit mode (#70): `m` (or the "Ink note (m)" button in the editor's edit-mode bar) turns the pointer into a comment pen; drawing a circle or an arrow on the slide opens the same note box as Alt+click, and the mark is kept in `comments.json` as `stroke` (`[[x, y], …]` in slide coordinates, at most 500 points; `pin` is its centroid; contract §12). The editor's overlay and `npm run comment-shots` draw it in the pin colour, the crop covers it, and the mode indicator reads "Editing: ink note".
