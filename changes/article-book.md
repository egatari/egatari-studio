### Added

- Book (article, format spec §9C, draft): the build reads `article.md` or chapters `article/<name>.md` (front matter `title`, `chapter`,
  `kind` preface/chapter/appendix/afterword, `numbering`, `writing-mode`), checks Egatari Text 1 and writes `out/<deck>.article.html`:
  numbered sections, figures, tables (merged cells written from the tree), boxes, theorems with ∎, exercises and solutions, footnotes,
  glossary, ruby, emphasis dots and upright digits in Japanese vertical writing, cross-references such as "図 4.1" and "4.1 節"
- `check` reports book problems as `article…` codes (§9C.8): constructs outside Egatari Text 1 with the replacement to write, labels,
  chapter order and numbers, cross-references, solutions, terms, step links, citation keys, images and slides' `data-article`
- `npm run ids` adds a missing section id `(sec-xxxxxx)=` before each `##` heading of the book, and writes the chapters' reading order
  into an existing `egatari.json` (`article`); without it, chapters are read by kind, then by file name
- Docs: [Writing a book](docs/article.md)

### Changed

- Dependencies: `myst-parser` 1.7.4, `myst-transforms` 1.3.51, `myst-ext-proof` 1.0.13, `myst-ext-exercise` 1.0.10, `vfile` 6.0.3 (build only;
  the editor app does not load them yet)
