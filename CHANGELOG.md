# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Stable slide ids (Etoki §8.1): `<section class="slide" id="s-k3f9q2">` keys the slide, and `narration.md` addresses it as `## Heading {#s-k3f9q2}` (also `## s-k3f9q2`; plain `## Heading` stays for slides without id). The id wins over the heading text, so renaming a heading no longer breaks narration, audio or timing. Decks may mix slides with and without ids
- `npm run ids -- <deck>`: adds ids to the slides that lack one, rewrites the narration headings, and renames the keys in `audio/manifest.json`, `timeline.json`, `comments.json` and `data-morph` (audio is reused). Idempotent, keeps line endings, backs up to `.cache/edits/`, refuses decks with duplicate keys or id collisions
- `npm run new` gives every slide a random id and writes `{#id}` headings; the dev server and the editor app write `## Heading {#id}` when they add a narration section for a slide with an id
- Checker: errors for an invalid slide id, two slides with the same key, a slide id equal to another id or `\htmlId{…}` in the deck, and a narration section (also one without steps) that matches no slide; info when a `{#id}` heading's text differs from the slide's heading
- Extension lines `@x-<name>-<field> <value>` inside a narration step (Etoki §8.2): excluded from turns, display text, TTS text, boundaries and digests, exposed by the parser as `ext` per step (`tools/narration-json.mjs` too), and kept verbatim by every edit path

### Changed

- A slide's `id` now wins over a hand-written `data-key`
- Step numbers must be canonical (`0`–`999`, no leading zeros, or `concl`): `[01]` is no longer read as step 1 (build warns, the checker reports an error)
- Duplicate slide keys are now a checker error (the build still adds `#2`, `#3`, … so the deck builds)
- Rewriting a narration step keeps the line ending of every other line (files with mixed CRLF/LF are no longer normalized)

### Fixed

- Narration maps are prototype-free: slide keys such as `__proto__` or `constructor` no longer collide with `Object.prototype` (build and runtime)
- Extension-like lines were glued onto the previous turn's text
- Dev-server narration drawer: "next step is on another slide" was wrong for slide keys containing `:`

## [0.2.1] - 2026-10-17

Windows support, bundled default voices, and a test page for TTS in the browser.

### Added

- Windows: CI runs the tests and the tier-2 dry run on `windows-latest`; checked on a real Windows 11 PC (Japanese and space characters in paths, CRLF checkouts, PowerShell). README: setup with winget, installing the skills with directory junctions (no administrator rights needed), PowerShell versions of the video commands
- Microsoft Edge as a fallback browser for the checker, PDF and tests when Chrome is missing (Chrome → Edge → Playwright's Chromium)
- `node tools/get-fonts.mjs` downloads the BIZ UDPGothic TTF files without sh or curl (replaces `tools/get-fonts.sh`)
- Default reference voices are now included: `tts/voices/bob.wav` (Expert) and `alice.wav` (Novice), with English versions `bob_en.wav` and `alice_en.wav`. All are synthetic, 48 kHz, −20 LUFS; where they come from and their licenses are in `tts/voices/README.md`
- English decks use `<name>_en.wav` when it exists (a Japanese reference makes VoxCPM2 speak English with an accent)
- Reference voices that are not 48 kHz mono are converted before they are sent to the TTS server (a 16 kHz reference made the mlx server read faster)
- `lab/irodori.html` (on GitHub Pages): a test page that runs Irodori-TTS 500M-v3 in the browser on WebGPU, with determinism, reading-dictionary, speed and mlx-comparison tests and a JSON report

### Changed

- **The default voice names are swapped to match the voices**: Expert = `bob`, Novice = `alice` (single speaker: `bob`). Decks that named `alice` or `bob` in `voice.json` or `--voices` now get the other voice
- Without uv, the build prints one line saying it skips subsetting, instead of a failure warning on stderr
- The Japanese template of `npm run new` uses 、。 punctuation

### Fixed

- Windows: the component headers in built HTML used `\` paths, so the editor app and the command line built different files
- Windows: the TTS scripts failed to read Japanese text because Python used the system code page (cp1252/cp932); input, output and console are now UTF-8

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

[Unreleased]: https://github.com/moiku/motion-academic-slides/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/moiku/motion-academic-slides/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/moiku/motion-academic-slides/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/moiku/motion-academic-slides/releases/tag/v0.1.0
