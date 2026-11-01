### Changed

- Editor app: New… step 4 lists the parts, grouped by what to convey (subject-specific forms last, first for a school lesson),
  instead of the subject and tool tiles. Standard parts start ticked; a specialized set is ticked from the subcategory or the words of step 2, with the reason
- Editor app: the chat AI's plan no longer limits the choice to two subjects; it sets the suggested size limit (40 KB or 120 KB), shown on a meter
  with the parts you could untick when the instructions are over it
- `studio.newDeck` records the ticked `parts` instead of `subjects`, `tools` and `purposesOff` (earlier records are still read)

### Fixed

- Instructions for the AI: the academic and kokugo series packs no longer name `m-sweep`, `m-kanbun`, `m-kobun` or `m-gendai` when those parts are left out
