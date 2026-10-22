### Changed

- Build: the theme's CSS (`tokens.css`, parent themes first) now comes after `kit/layouts.css` in `<style id="deck-base">` (before: after the fonts and KaTeX, before `base.css`), in every build path (CLI, `--dev` and the dev server, portable and play-only exports, the editor app). A theme rule now overrides a layout rule of the same specificity (the cover title's position, the `.body` inset, the heading rule, `.concl`, `.pn`) without an `html` prefix. `latin.css` stays last. The bundled themes (default, business, kokugo) render the same as before (backlog #75)
- New optional tokens with the old values as fallbacks: `--marker` (list markers; default `--term`), `--bar` and `--bar-h` (the progress bar; default `--emph`, 3px). Proposed with K1 by 須子 統太
