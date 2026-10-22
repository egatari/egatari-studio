### Fixed

- Printing and PDF: the section divider (`sec`) kept its text but lost its background (white text on white paper) unless the print dialog's “Background graphics” was on. Slides and dividers now carry `print-color-adjust: exact` (and `-webkit-print-color-adjust`) in `kit/base.css`'s print rules, so every slide background prints in its screen color; the page itself (`html`, `body`) stays white, and the screen rendering is unchanged. `tools/test-print-backgrounds.mjs` checks the computed styles in print media and the pixels of a PDF made without background graphics ([editor](docs/editor.md))
  ![A section divider printed to PDF, background kept](docs/images/print-sec.png)
