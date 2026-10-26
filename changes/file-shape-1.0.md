### Changed (API)

- Egatari files follow the 1.0 file shape (format spec §4.1, §4.2, §7.1, §8.1): the index and `deck-meta` carry **`player`** (`{"name": "egatari-player", "version": …, "title": "Egatari Player"}`, the bundled Egatari Player; its version is in `kit/player.json`, with `+dev.<commit>` when the player files differ from the release in `kit/player.lock.json`) and **`generator`** (`{"name": "egatari-studio", "version": <Studio's version>, "title": "Egatari Studio"}`, was `motion-academic-slides`; `title` is the name shown to people). `contracts` is `{"source": 1}`; `contracts.runtime` is no longer written or read.
- Every Egatari file carries the **file policy**: a Content-Security-Policy `<meta>` right after `<meta charset>` with the baseline that connects nowhere. A play-only copy with Live merges the Live's endpoint into its `connect-src` in place. Readers report a missing, misplaced or different policy (compared as parsed directives) as not conforming.

### Added

- `npm run player:check` (information only; `--strict` for the release candidate) and `npm run player:bump -- patch|minor|major` keep the bundled player's version and lock (RELEASING.md).
- Exporting an Egatari file gives every slide without an id an id and every script heading `{#id}`, and writes them back to the working folder (with the keys in `audio/manifest.json`, `timeline.json`, `comments.json` and `egatari.json`; backups in `.cache/edits/`). Files never carry heading-text keys, hand-written `data-key` or `s<n>` keys; the build and the quality checker still accept id-less source.
- The quality checker warns (never an error) about source outside the 1.0 vocabulary (format spec §8.0): the colour classes `blue`, `red`, `gray` (use `term`, `emph`, `muted`), `data-steps` and `data-anim` (steps and motion come from `data-step`, `data-at`, `draw` and parts), and `<html data-mode="lecture">` (the viewer's “Show later steps faintly”). Studio writes none of them, and no lesson seed (`data-egatari-seed`).
- The index validator accepts `index.article` and article-only lessons (no `entry`); reading a file written before the 1.0 shape (no `player`) still works and reports it (`preDraft`).

### Changed

- Saving without rebuilding (tier A) keeps `player` and `generator` byte for byte; a rebuild warns when the file carried another player (`playerChange`). A lesson with an article is not rebuilt (`article-unsupported`).
