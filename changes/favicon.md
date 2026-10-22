### Added

- Built decks now carry a tab icon: the Egatari mark (the optical 32 px version of `assets/logo`) as an inline `data:` SVG `<link rel="icon">` at the top of `<head>`. The same single SVG switches to the dark colours under `prefers-color-scheme: dark`, so it reads on light and dark tabs and is used by browsers that ignore `media` on `<link>`. It is added to the normal build, `--portable` and `--play-only` files (and the dev preview), needs no network and no change to the Live CSP (`img-src data: blob:` already allows it)
- Turn it off with `<html data-favicon="off">`; a deck that has its own `<link rel="icon">` (or `shortcut icon`) keeps it and nothing is added. The icon is added only to the built document, so the source files, `sourceSha256` and the theme hashes do not change
