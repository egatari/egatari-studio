# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Code is classified on the built document.** Whether a deck can run code is decided from the document the build produces — after every include and preprocessing step, covering every file read as text whatever its extension, and on the same bytes that are rendered ([format spec](https://github.com/egatari/egatari-spec) §6). The build inserts its trusted parts (fonts and runtime CSS, the runtime scripts) at element boundaries found by parsing, not by regular expressions, reports where it put them, and classifies everything else; a trusted part that the deck's bytes swallow or break out of is not trusted. The editor app classifies the preview document itself instead of reading the folder a second time, and keeps the previous preview until the question about code is answered. A portable file is classified on its extracted source and on a build of it; exports take their profile from the same result. `<meta http-equiv="refresh">` counts as code.
- **Component formulas: one selection rule.** `m-curves` uses its data only when exactly one direct child `<script>` has the type `application/json` (trimmed, case-insensitive; any id). The classifier applies the same rule, treats several or nested data blocks as code, and checks every candidate formula, so a decoy block (for example `id="deck-…"`) cannot hide the formula that runs.
- **Dev server: no top-level preview.** `/preview` serves the deck only with a capability issued with the frame page (or presenter window) and `Sec-Fetch-Dest: iframe`; opened directly it returns a 403 text page that runs nothing. Tests check that a framed preview cannot reach an outside URL with `top.location`, `window.open`, a `target=_blank` link or `location.replace`.
- **Saves recheck their deck after every wait.** Portable saves and the folder writes recheck the workspace after the permission prompt, the save picker and while writing, abort the file write when another deck was opened, write the settings (new lesson id) and mark the deck saved only after the final write, and keep the unsaved mark when an edit happened during the save.
- **Bounded reading of portable files.** The reader parses with budgets for elements, attributes and nesting counted while parsing (`kit/core/bounded-html.mjs`) and limits the tags in the extracted source; the editor app stops a read after 30 s. A 90 MiB file of tiny elements is refused in under 0.1 s.
- **The preview is inert while you edit narration**, too, and hints from the deck do not open, close or switch panels while you edit in a trusted field.
- **The preview policy is in force before any deck byte.** The editor app builds the preview document (and the presenter view and its inner views, also in the single-file build) as a trusted prefix — doctype, `<html><head>`, `<meta charset>`, the policy `<meta>` and the trusted shim — followed by the built deck unchanged, instead of searching the deck's markup for `<head>` (which a comment, a `<template>`, an attribute value or an early `<script>` could defeat). The editor page's own policy now has `frame-src 'none'`, so a deck cannot navigate its frame to the app's origin or to a `data:` URL. `tools/test-security.mjs` (in `npm test`) tries eleven such documents against a page with the editor's policy.
- **Dev server: one framable preview endpoint.** The deck document moved to `/preview`, with a CSP `sandbox` directive (opaque origin even when opened directly); the deck's and the frame page's `frame-src` allow only that endpoint. Files of the deck folder under `/deck/…` all carry `Content-Security-Policy: sandbox; default-src 'none'` and `nosniff`; anything but audio, video, images and fonts is served as `text/plain` or `application/octet-stream` with `Content-Disposition: attachment`, so an HTML or SVG file placed in the folder never runs as a document.
- **Whether a deck can run code is decided from its content**, not from the profile a portable file declares ([format spec](https://github.com/egatari/egatari-spec) §6; `kit/core/code-scan.mjs`): scripts without a data type, event-handler attributes, `javascript:` URLs, `srcdoc`, embedded documents, included SVG or HTML with any of these, JavaScript files, and component formulas that are not plain arithmetic. A file declared “core” with code in it is asked about like any other, with a warning about the inconsistent label. Every preview and presenter-view load — including reloads, polling rebuilds and opening the presenter — goes through that question; Cancel also closes the current preview and presenter view. Exports use the same rule for their profile.
- **Sizes are checked before allocation** (format spec §11): the editor app refuses a file from `File.size` before reading it, the reader counts the extracted size per path (several paths may share one blob) before decoding, and the reader worker transfers each blob once with a path table instead of one copy per path.
- **Saves are bound to their workspace.** Each write is tied to the workspace and a generation counter captured when it starts; if another deck is opened meanwhile, it is cancelled with a message and nothing is written to either. Writes run one at a time, and the source (or narration) is read again right before writing: an outside change after the check gives a conflict instead of being overwritten. Portable saves are serialized and bound the same way.
- **Editing controls are outside the slide area.** The edit-mode bar, source box, note box and list and the narration drawer form one side panel next to the preview, under an orange marker bar (“Editing — app” / “Editing — dev server”) that the deck cannot draw outside its frame; while a source or note box is open, the preview is `inert`. Anything inside the slide area can be drawn by the deck; trust only controls in the editor's own panels.
- **The preview can no longer write.** In the dev server and in the editor app, the editing UI (source card, narration drawer, comment box and list; `server/editor-ui.js`) moved out of the deck into a trusted page: the dev server's new frame page at `/` (the deck is now an iframe at `/deck/`) and the editor app's own page. The deck runs in a sandboxed iframe with an opaque origin and only sends hints (`server/hints.js`: the element or step to open, a note position, the keys `e` / `n` / `c` / Esc, its position), which carry no text to write. The trusted UI reads the source itself, checks the range against the current build and the hash, and writes only when Save (or ⌘/Ctrl+Enter) is pressed in it. The editor app no longer answers write requests from the preview at all (`app-api` is gone), and `server/client.js` is replaced by `server/hints.js` and `server/editor-ui.js`
- Dev server: the per-run token is embedded only in the frame page, never in the deck document; `/__dev/` refuses `Origin: null` and cross-site `Sec-Fetch-Site` even with the token; text edits must name an element marked editable by the current build, narration edits a slide of the deck; the frame page cannot be framed (`frame-ancestors 'none'`)
- No network from the preview: the deck document gets a Content-Security-Policy with `connect-src 'none'`, every other resource from `data:` / `blob:` only (the dev server also allows its own `/deck/audio/`, and frames only `/preview`), no workers, forms or `<base>` — in the dev server as a response header, in the editor app as the first element of the preview document
- Editor app: before running a deck's own code — a portable file with the “extended” profile, or a folder with components (`.js` files) or scripts in `deck.html` — the editor says so and starts the preview only after “Start the preview” (Cancel opens nothing)
- `tools/hostile-deck.mjs`: a deck whose component and inline script try to write (old write messages and hints with forged text, reading the token, reaching the parent document, `fetch` / XHR / beacon to the write endpoints with and without a guessed token); `tools/test-dev-server.mjs` and `tools/test-app.mjs` check that nothing in the folder changes and that only Save in the trusted UI writes

### Added

- Stable slide ids ([format spec](https://github.com/egatari/egatari-spec) §8.1): `<section class="slide" id="s-k3f9q2">` keys the slide, and `narration.md` addresses it as `## Heading {#s-k3f9q2}` (also `## s-k3f9q2`; plain `## Heading` stays for slides without id). The id wins over the heading text, so renaming a heading no longer breaks narration, audio or timing. Decks may mix slides with and without ids
- `npm run ids -- <deck>`: adds ids to the slides that lack one, rewrites the narration headings, and renames the keys in `audio/manifest.json`, `timeline.json`, `comments.json` and `data-morph` (audio is reused). Idempotent, keeps line endings, backs up to `.cache/edits/`, refuses decks with duplicate keys or id collisions
- `npm run new` gives every slide a random id and writes `{#id}` headings; the dev server and the editor app write `## Heading {#id}` when they add a narration section for a slide with an id
- Checker: errors for an invalid slide id, two slides with the same key, a slide id equal to another id or `\htmlId{…}` in the deck, and a narration section (also one without steps) that matches no slide; info when a `{#id}` heading's text differs from the slide's heading
- Extension lines `@x-<name>-<field> <value>` inside a narration step (format spec §8.2): excluded from turns, display text, TTS text, boundaries and digests, exposed by the parser as `ext` per step (`tools/narration-json.mjs` too), and kept verbatim by every edit path
- `vendor/egatari-spec/`: the JSON Schemas and test fixtures of the [portable deck format specification](https://github.com/egatari/egatari-spec), copied at a pinned commit by `node tools/sync-spec.mjs <clone>` (the commit is recorded in `SOURCE.json` there); the tests check the parser, the writer and the reader against them. Schemas are always loaded from this copy, never over the network
- Portable file: `node kit/build.mjs <deck.html> --portable` writes `out/<name>.ega.html`, one HTML file that plays like the normal build and also carries the deck's source (the files the build reads, `voice.json` without local paths) and its audio (stored once, AAC as with `--embed-audio`), following the [portable deck format](https://github.com/egatari/egatari-spec) draft. Comments, caches, backups, build output, credentials and unused audio stay out; registry components and themes are referenced by name, version and hash. A lesson id is kept in `egatari.json` in the deck folder, whose `metadata` may hold license, copyright, attribution and other descriptive fields
- `--play-only`: a copy without the source (keeps the audio, the lesson id and the license/copyright/attribution)
- `npm run portable -- unpack <file> <dir>` / `pack <dir>`: file ↔ folder. Unpacking reads the file as text without running it, checks every hash, size limit and path rule of the spec, and never writes outside `<dir>`; packing an unpacked folder gives the same file again
- The runtime plays audio stored inside the file (`<scheme>:<blobId>` references) as well as `data:` URIs, and ignores cue times of audio marked `sync: none`
- Checker: `slide key: legacy` warning for slides keyed by a hand-written `data-key` or by position (`s<n>`)
- Editor app: **open a portable file without a folder.** “Open file…” (first screen and toolbar) or drag and drop reads the file as bytes and extracts it in a Web Worker with the same reader as `npm run portable -- unpack` (scripting disabled; the file is never loaded as a page), then edits it in memory with the usual preview, editing tools and quick check. “Save” overwrites the same file through its file handle (else asks where to save, or downloads), “Save as…” writes another file, and “Export folder…” writes the source and audio to an empty folder (a non-empty one is refused). Saving rebuilds the file with the editor's bundled kit and keeps the lesson id, the rights notices, unknown index members, extension data and the audio bytes. Steps whose narration changed are listed as stale (their audio is kept)
- Editor app: **rights prompt** before the first edit of an opened file: title, creators, copyright, license and attribution (shown as claims); a no-derivatives license (Creative Commons `-ND`, “All rights reserved”) or a copyright notice without a license needs an explicit confirmation ([format spec](https://github.com/egatari/egatari-spec) §7.3). The prompt also guards every write
- Editor app: a notice for files that bring their own code (scripts or deck-local components; see Security); refusal with the reason for broken or unsafe files; for a newer major version or an unknown required feature, only “Export folder…” (source extraction)
- Editor app: **saving a portable file without rebuilding** ([format spec](https://github.com/egatari/egatari-spec) §7.2, tier A, `kit/core/tier-a.mjs`). When only narration, audio or timing overrides changed, Save rewrites only the changed entries of the runtime narration, mark, timing and audio data, the changed steps of the readable layer, the source hash, the index and its hash, and the archived files, and appends a font supplement only for characters the embedded fonts lack. Every other byte of the file stays, including runtime code written by other producers or versions; edited steps keep their audio and show it as stale
- Editor app: when a slide was edited, Save rebuilds the file and first warns that slides you did not edit may look different (Cancel keeps the changes unsaved)
- Editor app: **Save as new lesson…** (a new `docId`, the original recorded as `derivedFrom`; copyright, attribution and creators kept) and **Save a copy…** (same `docId`) next to **Save**, which never sets or changes `derivedFrom`
- `tools/test-tier-a.mjs` (in `npm test`) with a region-aware diff (`tools/tier-a-diff.mjs`): `examples/minimal` and `examples/tmlr2026-calibration` with a narration edit that needs a new glyph and a changed `pad_after`, playback in headless Chrome, unpack and pack again, a file from another producer, unknown members, replaced audio, a new lesson, refusals. Document fixtures with unknown members at every level, and two files whose source cannot be extracted
- Editor app: “Export portable file” for an open folder (writes the lesson id into the folder's settings file the first time)
- Editor app: a workspace interface (`list`, `readBytes`, `readText`, `writeText`, `writeBytes`, `exists`, `backup`) with two implementations, the chosen folder and an in-memory folder (`app/workspace.js`, `app/memfs.js`); `tools/test-workspace.mjs` (in `npm test`) tests the in-memory folder, the rights rules and the portable-file workspace without a browser
- Portable file: audio entries in the runtime carry the audio media type (`mime`), and the runtime uses it instead of sniffing the bytes; the reader's “extract only” mode reads a newer major version with the 1.x rules (source extraction, no editing)
- `tools/test-portable.mjs` (in `npm test`) and `tools/portable-fixtures.mjs <dir>` (document fixtures for the spec: canary script, `</script>` break-out, path traversal, future major version, unknown required feature, bad hashes, missing chunk, oversize index, duplicate JSON members, …)

### Changed

- Builds declare `unicode-range` on every embedded `@font-face`: subset fonts list the characters they keep, KaTeX fonts the characters of their `cmap` (precomputed in `kit/core/katex-ranges.mjs` by `node tools/katex-ranges.mjs`, so the command-line and editor builds stay byte-identical)
- Saving without rebuilding ([format spec](https://github.com/egatari/egatari-spec) §7.2): a font supplement is numbered one past the largest existing supplement, follows the last font style element, and has one `@font-face` per embedded face (family, weight, style) that lacks the new characters, so a file that embeds only weight 400 gets only 400
- Saving without rebuilding: removing a step's narration altogether also removes its audio record and audio data, with a warning (returned by `tierA()` and shown by the editor after saving); edited steps keep their audio as before (stale)
- Readable layer (§2.1): narration whose key matches no slide is left out and reported as a warning, by the portable writer and by saving without rebuilding; steps are in numeric order with `concl` last
- Saving without rebuilding (§9A): only the extension entries made from changed extension lines are rewritten; the version, other members, other steps and other extensions keep their bytes
- Dev server: `/` is a frame page around the deck (the deck document is at `/deck/`); `?presenter=1` on `/` opens a presenter window whose deck is sandboxed too, and the frame page relays its messages. The narration drawer sits beside the slide instead of over it, and typed input survives reloads (the save is refused if that part changed meanwhile)
- Editor app: the editing tools follow the editor's language (they followed the deck's language)
- Editor app: files whose runtime contract or registry component/theme hashes differ from the editor's open for narration, audio and timing edits only (saved without rebuilding) instead of read-only; read-only is left for files the editor cannot build, or that it can neither rebuild nor edit without rebuilding
- Editor app: the toolbar groups Open (folder / file), Save (new lesson / copy) and Export (HTML, portable file, folder, print) into menus and fits one row from 1280 px in both languages
- The rights prompt is shown each time a file is opened for editing, before the first change (as before; now stated in the docs as the spec requires)
- Reading a portable file: a file that requires a feature the reader does not implement can have its source extracted when the index and blobs validate (it was refused); a newer major version only when the index validates with the 1.x rules. Neither is ever edited or re-exported
- Rebuilding a portable file keeps members the editor does not know at every level of the index (metadata, audio records, blobs, components, themes, version), not only at the top; extensions made from extension lines that were deleted are no longer carried over
- `vendor/egatari-spec/` follows the spec at `0257ecc` (text only: derivation only with a new `docId`, extraction of unknown major versions and features, editors may add the settings file, unknown members at every level, rights prompt on every open)
- `vendor/egatari-spec/` follows the spec at `aea3c43` (theme entries with an optional path, optional audio media type, `null` input hash, C1 control characters in paths)
- Portable file: audio made from older narration is recorded with an input hash of `null` (unknown, treated as stale) instead of a made-up hash; unpacking and packing keep it. The readable layer without script is a `<section>`
- Reading a portable file refuses `audio/manifest.json` inside the archive and a settings file whose `docId` differs from the index, and treats a source hash recomputed from the files that differs from the index like a mismatch with the runtime metadata
- A slide's `id` now wins over a hand-written `data-key`
- Step numbers must be canonical (`0`–`999`, no leading zeros, or `concl`): `[01]` is no longer read as step 1 (build warns, the checker reports an error)
- Every `<` in the runtime JSON blocks is written as `\u003c`
- Duplicate slide keys are now a checker error (the build still adds `#2`, `#3`, … so the deck builds)
- Rewriting a narration step keeps the line ending of every other line (files with mixed CRLF/LF are no longer normalized)

### Fixed

- Narration maps are prototype-free: slide keys such as `__proto__` or `constructor` no longer collide with `Object.prototype` (build and runtime)
- Extension-like lines were glued onto the previous turn's text
- Dev-server narration drawer: "next step is on another slide" was wrong for slide keys containing `:`
- Editor app: when a folder or file with its own code asked before starting the preview, the previous deck stayed visible (and running) behind the question; the preview is now emptied first (the iframe is replaced), so nothing of either deck is shown or runs until you choose
- Runtime key list: the check for the dev server no longer looks for the removed `server/client.js` script or the badge that moved out of the deck; it uses `DECK_DEV`, set by the hints script

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
