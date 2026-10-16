# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-16

The editor app (no install), accessibility and captions, and `npm run new`.

### Added

- Editor app (no install): `npm run build:app` builds `dist/editor/` and a single-file `dist/editor.html`. Open a deck folder in Chrome/Edge (drag and drop or folder picker), edit text and narration, leave comments for Claude Code, export a single HTML, print to PDF — no Node or dev server needed
- `kit/core/`: the build and narration parsing no longer depend on Node, so the CLI and the app share them
- `npm run new -- <folder> [--lang en|ja] [--theme name] [--title "…"]` (`tools/new.mjs`): creates a new deck from a clean template (a cover and sample slides for steps, math with an attention mark, and a component, with narration for every step). It refuses to write into a folder that is not empty and prints the next steps. `npm test` now builds and checks the Japanese and English templates
- English versions of the contract, the dev-server guide and the video guide (`docs/contract.md`, `docs/dev-server.md`, `docs/video.md`)
- This changelog
- Accessibility: screen-reader announcements of slide and step changes (`aria-live`), hidden slides made `inert`, labelled and keyboard-focusable control-bar, presenter and overview buttons, math exposed as MathML
- Captions: `s` key / CC button / `?captions=1` show the current step's narration at the bottom of the slide; `render.mjs --captions` burns them into the video
- Checker: warns about images without `alt` and SVG figures without an accessible name
- Caption size: `Shift+s` cycles S / M / L (22 / 27 / 34px) with a brief notice, `?capsize=s|m|l`, the last choice is remembered; theme variables `--cap-size`, `--cap-bottom`, `--cap-side`, `--cap-max-lines`, `--cap-rate`
- Pen color: the pen buttons in the control bar show the current color, and while a pen is active Red / Blue / Black swatches appear next to them (also in the presenter view, synced with the main window); changing the color shows "Pen color: Blue" and the bottom-left indicator names the color

### Changed

- Captions while presenting by hand show one sentence group (about two lines, at most three) at a time and advance at reading speed (ja 7, en 15 characters/s), restarting at every step change, instead of stacking the whole step over the slide. Video mode (`?mode=video&captions=1`) is unchanged
- The Japanese docs moved to `docs/contract.ja.md`, `docs/dev-server.ja.md` and `docs/video.ja.md`, following the scheme of `docs/reference.md` / `docs/reference.ja.md` (English = `.md`, Japanese = `.ja.md`). All links in the repository were updated
- On a Mac, the help screen, the dev-server badge and the docs label the comment shortcut as ⌥ option + click instead of Alt + click

### Fixed

- The Black pen swatch and color dots now have a solid white ring, so they stay visible on the dark control bar and in the presenter view

## [0.1.0] - 2026-10-16

First public release.

### Added

- **Decks as a single HTML file**: `kit/build.mjs` turns `deck.html` (+ `narration.md`) into one self-contained file with fonts, KaTeX math and local images, videos and stylesheets embedded; it works offline
- **Steps** (`data-step`), with the conclusion line (`.concl`) always last, and **three modes** from one source: talk, lecture (everything visible, current step highlighted) and video
- **Math** rendered with KaTeX at build time, with theme-colored highlights (`\hlE`, `\hlT`, `\hlM`) and per-deck macros (`macros.tex`)
- **Animated figure components** (Web Components) whose screen depends only on (slide, step, time): `m-sweep`, `m-curves`, `m-flow`, `m-collect`, `m-seq`, with a generated catalog (`components/CATALOG.md`)
- **Attention marks** (`{mark:ID|effect}` in the narration): hand-drawn underline, circle, box, spotlight and laser dot, timed to the narration
- **Morph transitions** (`data-morph`, `\morph{ID}{…}`, `data-id`) that slide equations and elements from the previous slide
- **Presenter tools**: presenter view with speaker notes and timer, slide overview, laser pointer, pen and fading pen, a control bar, a key list (`?`), and a feedback link that sends no slide content
- **Themes** derived from one base color (`themes/<name>/tokens.css`, optional `theme.json` with `extends` and logos): `default`, plus the institutional themes `tml`, `tcue`, `wsd` and `ohte`
- **Checker** (`kit/check.mjs`): overflow, text size, steps, narration coverage, contrast, component determinism, marks and morphs, with Japanese and English rules
- **Dev server** (`server/dev.mjs`, default port 8730): live reload, in-browser editing of the source and the narration, comments for Claude Code in `comments.json`, local-only with a per-start token
- **PDF** export (`tools/pdf.mjs`), one page per slide
- **Narrated video (optional tier 2)**: TTS through an OpenAI-compatible speech server (`tts/synth.py`, Irodori-TTS for Japanese, VoxCPM2 for other languages) with a reading dictionary and caching, frame-exact rendering to per-step MP4 clips and a full video (`render/render.mjs`), a lesson bundle for canon (`render/export-canon.mjs`), and self-playing HTML with embedded AAC audio (`--embed-audio`)
- **Claude Code skills**: `motion-slides`, `motion-slides-video` and `motion-components`
- **Examples**: `examples/minimal` (Japanese, gradient descent) and `examples/tmlr2026-calibration` (English, a TMLR 2026 paper)
- Docs: README (English and Japanese), the contract (`docs/contract.md`), a reference of every option, syntax and key (`docs/reference.md`, `docs/reference.ja.md`), guides for the dev server and video, CONTRIBUTING, SECURITY, issue forms
- Tests (`npm test`) and GitHub Actions running them on Node 22 and 24, plus a TTS dry-run through video export

[Unreleased]: https://github.com/moiku/motion-academic-slides/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/moiku/motion-academic-slides/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/moiku/motion-academic-slides/releases/tag/v0.1.0
