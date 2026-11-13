### Changed

- Browser translation leaves math, code and parts alone: the build marks rendered formulas, code, pre and every part element with translate="no" (spec §8.0 Browser translation), and the book does the same for its formulas and code. Headings, body text, conclusion lines and captions stay translatable. An author's own translate attribute is kept (#194)
