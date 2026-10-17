# motion-academic-slides

English | [日本語](README.ja.md)

Academic slides as a single HTML file, with step-by-step reveals and animated figures that follow the order of your explanation. One source (`deck.html` + `narration.md`) gives you a live talk, a lecture view, a PDF, and, optionally, a narrated video made with TTS. It is designed to be driven by [Claude Code](https://claude.com/claude-code) through the skills in `skills/`, but every step is a plain Node command and works without it.

![A slide from the TMLR 2026 example](docs/images/hero.png)

## Features

- **Steps**: `data-step="k"` shows content in the order you speak. The conclusion line (`.concl`) always comes last
- **Math**: KaTeX, rendered at build time. `\hlE{…}` / `\hlT{…}` / `\hlM{…}` color a term using the theme
- **Animated figures**: Web Components (`components/`: `m-sweep`, `m-curves`, `m-flow`, `m-collect`, `m-seq`). The screen depends only on (slide, step, time), so the same deck can be exported frame by frame to video
- **Attention marks**: `{mark:ID|circle}` in the narration draws a hand-drawn underline, circle, box, spotlight or laser dot on the slide at that word
- **Morph transitions**: `data-morph` slides an equation or element from its place on the previous slide to its new place (like Keynote's Magic Move)
- **Three modes from one source**: talk (`?mode=talk`), lecture (`?mode=lecture`: everything visible, the current step highlighted), video (`?mode=video`)
- **Presenter tools**: presenter view with speaker notes and timer, slide overview, laser pointer, pen, fading pen, control bar
- **Themes**: one base color per theme (`themes/<name>/tokens.css`). Components only use theme variables
- **Checker**: `kit/check.mjs` reports overflow, text size, steps, narration coverage, contrast, component determinism, marks and morphs
- **Dev server**: edit text and narration in the browser, leave comments for Claude Code
- **Output**: one self-contained HTML file (fonts, math, and local images, videos and stylesheets referenced by the deck embedded; works offline). Print to PDF from the browser or with `tools/pdf.mjs`

**Reference**: every option, syntax, key and environment variable on one page: [docs/reference.md](docs/reference.md)

| Marks | Morph (before / during / after) |
|---|---|
| ![mark](docs/images/mark.png) | ![morph](docs/images/morph.png) |

| Presenter view | Slide overview |
|---|---|
| ![presenter view](docs/images/presenter.png) | ![overview](docs/images/overview.png) |

## Two ways to use it

| | Tier 1: slides (core) | Tier 2: narrated video (optional) |
|---|---|---|
| You get | HTML deck, presenter view, lecture mode, PDF | per-step MP4 clips, a full video, a lesson bundle |
| Needs | Node ≥ 22; Google Chrome only for checking, PDF and tests | everything in tier 1, plus ffmpeg, uv, a TTS server and reference voices |
| Optional | uv (font subsetting) | |

**Slides are fully usable without TTS.** No tier-1 command imports anything from `tts/` or `render/`, and `build`, `check` and the dev server work when `audio/` and `voice.json` are absent. Without audio, autoplay (`a`) uses the default timing for each step, and the narration still shows in the presenter view as speaker notes.

## Requirements

**Tier 1 (slides)**

- [Node.js](https://nodejs.org/) 22 or newer
- Google Chrome or Microsoft Edge for `kit/check.mjs`, `tools/pdf.mjs`, screenshots and tests (through `playwright-core`: Chrome first, then Edge). Building and presenting only need a browser to open the file. Without either, run `npx playwright-core install chromium` (the tools then fall back to Playwright's Chromium) or set `CHROME_PATH=/path/to/chrome-or-chromium`
- Optional: [uv](https://docs.astral.sh/uv/). After `node tools/get-fonts.mjs` downloads the BIZ UDPGothic TTF files, the build uses uv to run `pyftsubset` and embeds only the glyphs you use. Without the TTF files (or without uv) it embeds the matching `@fontsource` WOFF2 subsets instead. Those files are larger but look the same

**Windows**

A fresh Windows has neither Node.js nor Git. In PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS Git.Git     # then open a new terminal
winget install astral-sh.uv Gyan.FFmpeg      # optional: uv (smaller fonts), ffmpeg (video)
```

Edge is already there, so the checker and PDF work without Chrome. Run the commands below in PowerShell or Git Bash; replace `open` with `start`. Without Git, download the ZIP from GitHub (Code → Download ZIP). Making the narration audio (tier 2) needs a TTS server; mlx-audio, the one we test with, runs only on a Mac with Apple silicon.

**Browsers**

- Presenting the built HTML: Chrome/Edge 119+, Firefox 128+ or Safari 18+ (these support the CSS relative color syntax and `color-mix()` that themes use to derive tints from `--base`). Older browsers still show the deck, with fixed fallback colors taken from the default theme instead of colors derived from the theme's `--base`
- PDF (`tools/pdf.mjs`), video (`render/`), `kit/check.mjs` and the tests are produced and tested with Google Chrome (or Playwright's Chromium) only; Edge uses the same engine

**Tier 2 (video)**

- ffmpeg and ffprobe on `PATH`
- uv (runs the small Python project in `tts/`)
- A TTS server with an OpenAI-compatible speech API, e.g. [mlx-audio](https://github.com/Blaizzy/mlx-audio) serving `mlx-community/Irodori-TTS-v4.1-Small-fp16` (Japanese) or `mlx-community/VoxCPM2-8bit` (English and others). Set `IRODORI_URL` (default `http://localhost:8882`)
- Reference voices: the default voices `bob` and `alice` (synthetic, Japanese and English) are included in `tts/voices/` ([details](tts/voices/README.md)). Add your own as `<name>.wav` there (gitignored) or in `IRODORI_REF_DIR`

## Quick start (tier 1: slides)

```bash
git clone https://github.com/moiku/motion-academic-slides.git
cd motion-academic-slides
npm ci
node tools/get-fonts.mjs                            # optional: smaller font embedding (uses uv at build time)

node kit/build.mjs examples/minimal/deck.html       # -> examples/minimal/out/deck.html
open examples/minimal/out/deck.html                 # macOS; elsewhere, open the file in a browser

node kit/check.mjs examples/minimal/deck.html       # checker; the last line should read "エラー 0" (0 errors)
node tools/pdf.mjs examples/minimal/out/deck.html examples/minimal/out/deck.pdf   # PDF, one page per slide
node server/dev.mjs examples/minimal/deck.html      # dev server at http://127.0.0.1:8730/ (Ctrl+C to stop)
```

### Start your own deck

```bash
npm run new -- talks/mytalk --lang en --theme default --title "My talk"
npm run build -- talks/mytalk/deck.html    # -> talks/mytalk/out/deck.html
npm run dev -- talks/mytalk/deck.html      # edit in the browser
npm run check -- talks/mytalk/deck.html    # the last line should read "エラー 0" (0 errors)
```

`npm run new -- <folder>` creates `deck.html` and `narration.md` from a clean template: a cover and sample slides showing steps, math, an attention mark and a component, with narration for every step. Options: `--lang en|ja` (default `ja`), `--theme <name>` (default `default`), `--title "…"`. It refuses to write into a folder that is not empty. You can change the theme later with `<html data-theme="tml">` or `--theme tml`. With `<html lang="en">` body text is set in Source Sans 3 and the checker uses English rules. For a fuller example, see `examples/minimal/`.

## Editing in the browser (dev server)

You rarely need to open `deck.html` by hand. Start the dev server and fix things on the slide itself:

```bash
node server/dev.mjs path/to/deck.html            # then open http://127.0.0.1:8730/  (Ctrl+C to stop)
```

The page is the normal deck (arrow keys, `p`, `a`, … all work). It reloads by itself whenever a file of the deck changes, and stays on the same slide and step.

1. **Fix text: `e`, then double-click.** Editable elements get a dotted outline. Double-click one to open its source (HTML, with math as `\( … \)`), edit, and press ⌘/Ctrl+Enter. Only that element is replaced in `deck.html`.
2. **Fix the narration: `n`.** A drawer shows the narration of the current step. Edit the text (add or remove turns, change the speaker) and save. Only that step is replaced in `narration.md`.
3. **Ask Claude Code: Alt+click (on a Mac, hold ⌥ Option and click).** Write what you want changed ("make this figure larger", "split this slide"). Comments go to `comments.json`; `c` lists them. Then tell Claude Code "Apply the comments" and it edits the deck; the page updates as soon as it saves.
4. **Undo:** the previous versions of `deck.html` and `narration.md` are kept in `.cache/edits/` (last 30).

| `e` + double-click: edit the source | `n`: edit the narration | Alt / ⌥ Option + click: comment for Claude Code |
|---|---|---|
| ![editor](docs/images/dev-editor.png) | ![narration](docs/images/dev-narration.png) | ![comment](docs/images/dev-comment.png) |

Details: [docs/dev-server.md](docs/dev-server.md) ([日本語](docs/dev-server.ja.md)).

## Editor app (no install)

The same editing as the dev server, as a web page that opens a deck folder directly. Nothing to install: no Node, no terminal. It needs **Google Chrome or Microsoft Edge on a computer** (it uses the File System Access API, which Safari and Firefox do not have).

- **Open the editor:** **<https://moiku.github.io/motion-academic-slides/editor/>** in Chrome or Edge (nothing to install), or build it yourself with `npm run build:app` and open `dist/editor.html` (one file, about 10 MB) by double-clicking it.
- **Open a deck:** drop the deck folder (the one with `deck.html`) on the page, or press 「フォルダを開く」 / "Open folder", and let the browser edit that folder. "New deck" makes `deck.html` and `narration.md` from the same template as `npm run new`. Recent folders are listed on the first screen.
- **Edit:** the same keys as the dev server: `e` + double-click for the source, `n` for the narration, Alt / ⌥ Option + click for a comment to Claude (`comments.json`), `c` for the list. Backups go to `.cache/edits/` in the folder.
- **Work with Claude Code:** when anything else changes the files (Claude Code, a text editor), the editor notices within about 2 seconds, rebuilds, and stays on the same slide and step. A build error is shown over the preview until it is fixed.
- **Language:** the editor follows your browser language; the **English / 日本語** button at the top right (or `?lang=en` / `?lang=ja`) switches it.
- **Toolbar:** quick check, export as a single HTML file, print / PDF, presenter view (a window with the narration and the next step), fullscreen.

Limits: narration audio (TTS), video, `npm run check` (the full check) and `tools/pdf.mjs` stay on the command line, and audio in the folder is not played. The quick check is a subset (overflow, font size, length, missing narration, contrast) and is only a hint; the full check is `npm run check`. Exported HTML embeds whole font files instead of a subset (no fonttools in the browser), so it is larger than a command-line build (about 2 MB instead of 0.7 MB for `examples/minimal`). Repository components and themes are the ones bundled when the editor was built; components and themes inside the deck folder are read from the folder.

![editor app](docs/images/editor-app.png)

Details: [docs/editor.md](docs/editor.md) ([日本語](docs/editor.ja.md)).

## Using it with Claude Code

Link the skills into your Claude Code skills folder. The skills find the repository from their real path, so keep the clone where it is:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/motion-slides"       ~/.claude/skills/
ln -s "$PWD/skills/motion-slides-video" ~/.claude/skills/
ln -s "$PWD/skills/motion-components"   ~/.claude/skills/
```

| Skill | Use it for |
|---|---|
| `motion-slides` | plan, write, step, narrate, check and build a deck (tier 1) |
| `motion-slides-video` | TTS, render and export a deck as video (tier 2) |
| `motion-components` | write a new animated figure component, or move one into the library |

Example prompts:

- "Use motion-slides to make HTML slides from `paper/main.tex` for a 10-minute talk, default theme, single speaker."
- "Add a slide that shows how the loss changes with the learning rate, using m-sweep."
- "Apply the comments." (after leaving Alt / ⌥ Option+click comments in the dev server; Claude reads `comments.json`)
- "Turn `talks/intro` into a narrated video with motion-slides-video."

The skill first shows you an outline and writes HTML only after you approve it.

## Making a video (tier 2)

```bash
D=examples/minimal
uv run --project tts python tts/synth.py $D --dry-run    # silent placeholder audio, to try the pipeline offline
uv run --project tts python tts/synth.py $D              # real TTS (needs the server and the voices)
node kit/build.mjs $D/deck.html                          # rebuild so the audio lengths enter the timeline
node render/render.mjs $D/out/deck.html --out $D/video   # add --only "更新の式:2" for one step, --full for one file
node render/export-canon.mjs $D --render $D/video --out $D/bundle
```

- Voices: `--voices expert=bob,novice=alice`, or `<deck>/voice.json` (`{"expert": "me"}`, or a path to a wav file). The defaults are `bob` (single speaker) and `bob` / `alice` (dialogue), looked up as `tts/voices/<name>.wav`; in an English deck `<name>_en.wav` is used when it exists
- If the server is not running or a voice file is missing, `synth.py` stops and names the URL or file it could not reach
- `export-canon.mjs` writes a lesson bundle (Marp-style markdown plus one MP4 and one PNG per step) for canon, our lab's lecture delivery system; other systems that accept the same format can use it too. With `CANON_DIR` set, it also validates the bundle with canon's own parser. Without it, that check is skipped
- **Self-playing HTML with audio**: `node kit/build.mjs $D/deck.html --embed-audio` puts the narration inside the HTML, so the single file plays with `a` (autoplay) anywhere. The audio is compressed to AAC (64 kbps, mono; about 4.5 MB for a 5-minute talk, instead of ~30 MB as WAV), which every current browser plays. Without `--embed-audio` the HTML refers to the WAV files in `audio/` and nothing is converted. If ffmpeg is missing, the WAV files are embedded as they are and the build warns
- Details (caching, timing overrides in `timeline.json`, the reading dictionary): [docs/video.md](docs/video.md) ([日本語](docs/video.ja.md))

## Keys (presenting)

| Key | Action |
|---|---|
| → / Space, ← | next / previous step |
| Shift+→ / Shift+← | next / previous slide |
| number + Enter | go to that page |
| f | fullscreen |
| p | presenter view (speaker notes, next step, timer) |
| a | autoplay (plays the audio if the deck has it) |
| l | lecture mode |
| b | black screen |
| s / Shift+s | captions (narration, about two lines at a time) / caption size S, M, L |
| o | slide overview (arrows + Enter) |
| x / d / v | laser / pen / fading pen; Shift+d (or the swatches in the control bar) changes the pen color |
| Backspace (Shift+Backspace) | while a pen is active: clear the drawings on this slide (on all slides) |
| Esc | leave the current tool |
| ? | list of keys |

All keys (Home/End, PageUp/PageDown, presenter-view keys) and URL parameters: [docs/reference.md#presenting](docs/reference.md#presenting).

Moving the mouse shows a control bar with the same actions. It hides after 2.5 s. Drawings are kept per slide and never appear in print or video.

![control bar](docs/images/controls.png)

## Themes

A theme is a folder `themes/<name>/` with:

- `tokens.css`: CSS variables. Usually only `--base` (the base color) is needed. The other colors (`--term`, `--emph`, `--muted`, `--title`, tints, `--series-*`) are derived from it in `themes/default/tokens.css`, and you can override any of them
- `theme.json` (optional): `{"name": "mylab", "extends": "default", "logos": ["logos/cover.png"]}`. Logos appear on the cover slide

```bash
mkdir -p themes/mylab
printf ':root{ --base: #006d5b; }\n' > themes/mylab/tokens.css
printf '{"name": "mylab", "extends": "default"}\n' > themes/mylab/theme.json
node kit/build.mjs examples/minimal/deck.html --theme mylab
```

A theme can also sit next to a deck (`<deck>/themes/<name>/`). Included: `default` (neutral) and the institutional themes `tml`, `tcue`, `wsd` and `ohte`, which include university logos (see License).

## Examples

| Example | What it shows |
|---|---|
| [`examples/minimal`](examples/minimal) | Japanese, 6 slides on gradient descent: steps, KaTeX with `\hlE`, `{mark}`, `data-morph`, `m-sweep`, narration for every step. A fuller example to learn from (`npm run new` makes a clean template) |
| [`examples/tmlr2026-calibration`](examples/tmlr2026-calibration) | English, 14 slides introducing a TMLR 2026 paper: deck-local components (`components/`), data made by scripts (`scripts/`, `data/`), English TTS (`voice.json`), theme `tml` |

The `voice.json` of `examples/tmlr2026-calibration` uses the engine's default voice. The published video of this example was narrated with the author's own reference voice, which is not included in the repository.

`examples/minimal`:

![minimal example](docs/images/minimal-sheet.png)

`examples/tmlr2026-calibration`:

![tmlr2026-calibration example](docs/images/tmlr-sheet.png)

## Repository layout

| Path | Contents |
|---|---|
| `docs/contract.md` | the contract: position and time, components, narration, timeline, marks, morphs. **Read this first** ([日本語](docs/contract.ja.md)) |
| `docs/dev-server.md`, `docs/editor.md`, `docs/video.md` | guides: the dev server, the editor app, and making a video ([日本語](docs/dev-server.ja.md), [日本語](docs/editor.ja.md), [日本語](docs/video.ja.md)) |
| `docs/reference.md` | reference: deck syntax, narration, timing, themes, keys, URL parameters, and all CLI options and environment variables ([日本語](docs/reference.ja.md)) |
| `kit/` | runtime (`deck.js`, `presenter.js`, `tools.js`), styles, build, narration parser, checker, browser launcher; `kit/core/` is the build shared by Node and the editor app, `kit/templates/` the new-deck template |
| `components/` | animated figure components; catalog in `components/CATALOG.md` |
| `themes/` | themes |
| `server/` | dev server and in-browser editor |
| `app/` | editor app (no install): sources; `npm run build:app` makes `dist/editor/` and `dist/editor.html` |
| `tts/`, `render/` | tier 2: TTS (a uv project), video rendering, bundle export |
| `skills/` | Claude Code skills |
| `tools/` | new-deck template (`new.mjs`), tests and helpers (`smoke`, `test-*`, `shot`, `pdf`, `get-fonts.mjs`) |
| `CHANGELOG.md` | changes in each release |

Tests (need Chrome):

```bash
node kit/build.mjs examples/minimal/deck.html
node tools/smoke.mjs examples/minimal/out/deck.html /tmp/smoke     # timeline + screenshots
node tools/test-components.mjs
node tools/test-tools.mjs examples/minimal/out/deck.html
node tools/test-controls.mjs examples/minimal/out/deck.html
node tools/test-dev-server.mjs
node tools/test-app.mjs                                            # editor app (builds dist/editor in a temp folder)
```

## Feedback & contributing

- In a deck, press `?` and click **Send feedback** (also in the presenter view). It opens a [feedback form](https://github.com/moiku/motion-academic-slides/issues/new?template=feedback.yml) with only the version, browser, OS, language and mode filled in; nothing from your slides is sent. Turn it off with `<html data-feedback="off">`
- In Claude Code, say "send feedback": the skill drafts an issue from the session and creates it only after you confirm
- Want a new figure? [Request a component](https://github.com/moiku/motion-academic-slides/issues/new?template=component-request.yml), or write one in your deck and [submit it](https://github.com/moiku/motion-academic-slides/issues/new?template=component-submission.yml)
- Questions: [Discussions](https://github.com/moiku/motion-academic-slides/discussions). How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- What changed in each release: [CHANGELOG.md](CHANGELOG.md)

## Security

A deck is code: its scripts and components run in your browser and in the headless Chrome used by the checker and renderer, and the build reads local files inside the deck folder. Build and serve only decks you trust. The trust model and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## License

- Code: [MIT](LICENSE), Copyright (c) 2026 Gendo Kumoi. Fonts, KaTeX fonts and logos: see [NOTICE](NOTICE)
- Fonts: BIZ UDPGothic and Source Sans 3 are licensed under the SIL Open Font License 1.1 ([fonts/OFL.txt](fonts/OFL.txt) for BIZ UDPGothic; the `@fontsource` packages ship their own license files). Built decks embed subsets of them. KaTeX and its fonts are MIT
- The university logos in `themes/tml`, `themes/tcue`, `themes/wsd` and `themes/ohte` belong to their institutions and are not covered by the MIT license
