### Added

- Parts library 2.9.0 is now the default (release d19428d, tarball 411ba844…). New parts: `m-callout` (画面の手順 / Screen steps: numbered marks on a screenshot, joined to their explanations one step at a time) and `m-checklist` (確かめる一覧 / Checklist) in the tools set, and `m-diverge` (ウォーターフォール / Waterfall: from a baseline, increases and decreases stacked up to the total) in the business set. `m-bars` 2.1.0 draws error bars (`err`), significance brackets (`sig`) and dots (`mark="dot"`). Sixteen other parts get small fixes or README updates
- New… shows the three new parts with a one-line description and an icon, and `m-diverge` under 差・増減 / Deviation

### Changed

- The AI instructions list a purpose only when the instructions include a part for it, and say only that other parts exist, without naming what they are for (so a standard-only pack does not name purposes whose parts are in a set that is not included)
- On the free plan, the `m-bars` section leaves out the notes on error bars and significance brackets (the data shape still lists `err` and `sig`); the paid plan keeps them. With this, the English free standard instructions are 30,167 paste units (cap 31,000)
- The English instructions no longer say the part notes are in Japanese (the standard parts' English sections have no Japanese)
