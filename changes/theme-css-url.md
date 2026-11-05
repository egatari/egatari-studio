### Fixed

- Themes: a relative `url(...)` in a theme's `tokens.css` (directly, or via a custom property such as `--cover-bg: url(cover.png)`) is now
  inlined as a `data:` URI, so the image shows in any shipped file; it stays inside the theme folder (like logos), enters the theme sha256 and
  the portable file's `themes/<name>/`, and the editor reads such images from a theme ZIP too
