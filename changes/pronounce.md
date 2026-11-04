### Added
- **Pronunciation…** in the script drawer (editor app and dev server, #101): select a word or symbol (or put the caret in it) and give its reading; the source gets `{x|y}`, and the drawer shows the reading small above the word (ruby) instead of the braces, with the caret, undo, redo and copy working on the source text. Options: **Apply to all in this script** (other steps are written on save, with a backup) and **Add to dictionary** (kept in this browser and filled in the next time the word is selected). In the editor app the reading can be tried with read-aloud or AI voice on this computer. Selections that are not one word or symbol (R-reading) are refused with what to select. Works for Japanese and English (`θ` → theta, `SQL` → sequel).

### Changed
- The turns of the script drawer are one-line rich fields instead of text areas: Enter no longer inserts a line break (it was joined on save anyway).
