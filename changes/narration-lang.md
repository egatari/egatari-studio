### Changed

- Checker: the narration language is decided apart from the slide language (`"lang"` in `voice.json`, otherwise the script of
  the turns, otherwise `<html lang>`), and R-formula and long turns use each turn's own language; a new info `narrLang` says so

### Fixed

- Checker: English narration on a Japanese deck no longer gives an R-formula warning for every English sentence
- Checker: a Japanese sentence that only names things in Latin letters (“Markdown と HTML”) is no longer taken for a formula;
  formulas such as `ax + by = c` or `sin x cos y` still are
