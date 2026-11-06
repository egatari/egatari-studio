### Security

- Bundle the book tools with markdown-it 14.3.3 for the CLI and editor, fixing the five markdown-it 13 advisories and removing the temporary audit exceptions. Keep the v0.6.5 paragraph guard as a second layer.

### Changed

- Ship one generated book-tools bundle; move the myst packages, vfile and markdown-it to development dependencies so installed packages no longer pull in the parser dependency tree. Check the committed bundle for byte drift with `npm run gen:check`.
