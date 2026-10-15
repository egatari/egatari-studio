# Reference

English | [日本語](reference.ja.md)

Every user-facing option, syntax and key, one line each, taken from the code. The reasons and the exact rules (position and time, timeline formula, marks, morphs) are in [contract.md](contract.md) (Japanese). Workflow guides: [README](../README.md), [dev-server.md](dev-server.md), [video.md](video.md).

Contents: [Deck syntax](#deck-syntax) · [Narration](#narration-narrationmd) · [Timing](#timing-timelinejson) · [Themes](#themes) · [Components](#components) · [Presenting](#presenting) · [Dev server](#dev-server) · [Checker](#checker) · [Build](#build) · [TTS](#tts) · [Render and export](#render-and-export) · [Tools](#tools) · [Environment variables](#environment-variables)

## Deck syntax

### Files in the deck folder

| File | Read by | Purpose |
|---|---|---|
| `deck.html` | build | the slides (any name; `examples/minimal/deck.html` is the template) |
| `narration.md` | build, TTS, export | narration per step |
| `timeline.json` | build | per-step timing overrides |
| `macros.tex` | build | KaTeX macros (`\newcommand`, `\renewcommand`, `\def`; added to the default macros) |
| `audio/manifest.json` | build | written by `tts/synth.py` |
| `voice.json` | TTS | voices, language, engine |
| `figs/*.svg`, `data/*.json` | build | for `{{FIG:…}}` / `{{JSON:…}}` |
| `components/<name>/index.js` | build | deck-local components (found before the repository's) |
| `themes/<name>/` | build | deck-local themes |
| `comments.json`, `.cache/edits/` | dev server | written by the dev server |
| `out/<name>.html` | — | default build output |

### Sections and classes

| Markup | Meaning |
|---|---|
| `<section class="slide">` inside `<div id="stage">` | one slide (1280×720). `<h2>` heading, `<div class="body">` body, `<div class="concl"><span>…</span></div>` conclusion line |
| `class="slide cover"` | cover: `.venue`, `<h1>`, `.au`; theme logos are added at the bottom left |
| `data-nologos` on the cover | no theme logos on this cover (also skipped when the cover already has a `.logos` element) |
| `class="slide sec"` | chapter divider (`<h1>`, `.lead`). Starts a chapter for `--full` video export |
| `class="slide sec appendix"` | appendix divider. Page numbers after it read 付録 / Appendix. Without `appendix`, a `sec` slide whose text contains 付録 or Appendix also counts |
| `class="… static"` | no steps at all: everything visible, `.concl` is not a separate step |
| `class="… nostep"` | do not turn list items into steps automatically |
| `class="… noconcl"` | no conclusion line: the body may extend to 680px instead of 565px |
| `id="…"` on a section | slide key (overrides the heading). Use when two headings are the same. See [Slide keys](#slide-keys) |
| `data-morph` / `data-morph="key"` | morph in from the previous slide / from the slide with that key ([contract §8](contract.md#8-モーフdata-morph)) |
| `data-chapter="name"` | start a chapter here with this name (like a `sec` slide) |
| `data-steps="n"` | minimum number of steps (for legacy `data-anim`) |
| `data-anim="name"` | legacy animation: calls `DECK.ANIM[name](slide, k, instant)`; in video it shows only each step's final state. Write components instead |
| `<div class="pn">` as a direct child | your own page number (otherwise one is added from slide 2 on: `i/N`) |
| `<html lang="en">` | English deck: Source Sans 3 body font, English UI text, English checker rules, `voxcpm2` TTS |
| `<html data-theme="name">` | theme (overridden by `--theme`) |
| `<html data-mode="lecture">` | default mode when the URL has no `?mode=` |

Body classes (all colors come from the theme): `.sub` subheading · `.big` main equation · `.note` note (27px) · `.thm` theorem box · `.box` tinted box · `.cols` side-by-side columns · `.arrow` centered arrow line · `.fig` / `.figcap` figure and caption · `.cite` citation (20px) · `.plot` box for `DECK.Plot` · `.readout .num` tabular number · `td.r` right-aligned cell · `.term`/`.blue`, `.emph`/`.red`, `.muted`/`.gray`, `.b` colors and bold.

### Step attributes

| Attribute | Meaning |
|---|---|
| `data-step="k"` | appears at step k (k ≥ 1). Step 0 = what is visible on entering |
| (none on the slide) | if a slide has no `data-step` and no `data-from`, each `.body > ul > li` and `.body > ol > li` becomes steps 1, 2, … |
| `.concl` | always the last step (`max + 1`), step key `concl` |
| `data-at="s"` | within its step, start s seconds later (fade and `.draw`) |
| `class="draw"` | SVG stroke drawn in (needs `pathLength="1"`). Step = closest `data-step` ancestor, its own `data-step`, or 0. 0.7 s |
| `class="draw drawslow"` | same, 1.4 s |
| `data-from="k"` (component) | component's first step is slide step k (default 1) |
| `steps="n"` (component) | override the component's step count |
| `data-id="ID"` | morph pairing ([contract §8](contract.md#8-モーフdata-morph)) |
| `id="ID"` / `data-mark="ID"` | target of `{mark:ID}` ([contract §7](contract.md#7-注目の演出mark)) |
| `data-key`, `data-title` | added by build (slide key, plain heading). A hand-written `data-key` on a section is used as the slide key (it wins over `id`); see [Slide keys](#slide-keys) |

### Math

| Syntax | Meaning |
|---|---|
| `\( … \)` / `\[ … \]` | inline / display math, rendered by KaTeX at build time (not inside `<script>`, `<style>`, `<svg>`, `<textarea>`, comments) |
| `\hlE{…}` `\hlT{…}` `\hlM{…}` | color part of a formula as conclusion (`--emph`) / term (`--term`) / known result (`--muted`) |
| `\morph{ID}{…}` | morph pairing inside a formula (= `\htmlData{id=ID}{…}`) |
| `\htmlId{ID}{…}`, `\htmlData{mark=ID}{…}` | mark target inside a formula |
| `\htmlClass{name}{…}` | CSS class inside a formula. Only these three `\html…` commands are allowed |
| `macros.tex` | `\newcommand{\R}{\mathbb{R}}`, `\newcommand{\v}[1]{…}`, `\def\x{…}`; nested braces up to 3 levels |
| `<script type="text/x-tex-macros">…</script>` | more macros in the same syntax, inside `deck.html` |
| KaTeX errors | build warns and shows the source in red (`.katex-error`); the checker reports it as an error |
| `DECK.svgMath(…)` in a component or deck script | KaTeX is also embedded at run time (with the same macros) |

### Includes

| Syntax | Meaning |
|---|---|
| `/*INCLUDE:file*/` | file contents inserted verbatim (deck folder, then `kit/`). A path that leaves these folders (`../`, absolute, symbolic link) is refused with a warning and replaced by nothing |
| `{{FIG:name}}` | `figs/name.svg` (or `name.svg` in the deck folder) inlined; ids prefixed with `name-`, width/height removed |
| `{{JSON:file}}` | JSON from `data/` (or the deck folder), minified. Put it in `<script type="application/json">` inside a component to read it as `this.data` |
| `<m-name …>` | component; `components/name/index.js` loaded automatically |

`{{FIG:…}}`, `{{JSON:…}}`, `narration.md`, `timeline.json`, `macros.tex` and the files in `audio/manifest.json` are read only if they resolve (after following symbolic links) inside the deck folder; otherwise the build warns (`refused: …`) and skips them.

### Assets (embedded at build time)

| Reference | Becomes |
|---|---|
| `<img src>`, `<source src/srcset>`, `<img srcset>`, `<video src/poster>`, `<audio src>`, `<track src>`, SVG `<image href>` | `data:` URI |
| `url(…)` and `@import` in the deck's `<style>` and `style=""` attributes | `data:` URI / the imported CSS inlined (`url()` in a linked or imported CSS file is relative to that file) |
| `<link rel="stylesheet" href="file.css">` | `<style>` with the file's contents |
| `<link rel="icon">` and other `<link>` files, `<script src="file.js">` | `data:` URI / inline script |

Relative paths are resolved from the deck folder and must stay inside it. `data:`, `blob:`, `#fragment` and template values (`${…}`, `{{…}}`) are left as they are. Warnings: `missing: …` (file not found), `refused: …` (outside the deck folder), `external: …` (an `http(s)` reference in an asset position, including `<iframe>`/`<object>`: left as it is, so the deck is not fully offline). Ordinary links (`<a href>`) are not touched. Audio from `audio/manifest.json` is embedded only with `--embed-audio`.

### Slide keys

Each slide gets one key, unique in the deck: `data-key`, else `id`, else the normalized heading, else `s<n>`. Explicit keys (`data-key`/`id`) are claimed first, in document order. A repeated explicit key gets a warning (`slide key: …`) and a suffix `#2`, `#3`, … on the later slides. Keys made from a heading or a number never take an explicit key or an existing `#n` key; they also get the next free `#n`. The final key is written to the section's `data-key` (a hand-written `data-key` is rewritten when it had to change), and `narration.md` headings (`## key`) must use it.

## Narration (narration.md)

| Syntax | Meaning |
|---|---|
| `## heading` | slide: the heading text without tags and spaces, or the section `id` |
| `## heading#2` | second slide with the same heading (third: `#3`); better: give it an `id` |
| `[0]` `[1]` … `[concl]` | narration for that step; following lines continue it |
| `Expert:` / `Novice:` (`E:` / `N:`, full-width colon allowed) | speaker turn. Lines without a speaker are Expert (single speaker) or continue the previous turn |
| `{cue}` | sync point within a step; matches the component's `cues(k)` in order |
| `{mark:ID}` | underline the target at this word |
| `{mark:ID\|effect}` | effect: `underline`, `circle`, `box`, `spot`, `laser` |
| `{mark:ID\|effect\|hold=2}` | disappear after 2 s (default: end of step; `laser` 1.5 s) |
| `{mark:clear}` | remove this step's marks now |
| `{φ\|ファイ}` | shown as φ, read as ファイ |
| `# title` | ignored |
| `<!-- … -->` | comment on its own line(s), ignored |
| a step written twice | the last one wins |

Build warns about a `##` that matches no slide (the checker makes this an error), unknown mark effects, and mark targets not found in the source.

## Timing (timeline.json)

`dur = override.dur ?? max(anim, audio ? lead + audio + pad_after : max(hold, marksEnd + pad_after))` ([contract §5](contract.md#5-タイムライン)).

| Key in `"slideKey:step"` | Default | Meaning |
|---|---|---|
| `dur` | — | fixed length (s); audio past `lead + dur` is cut |
| `hold` | 1.2 | length of a step without audio |
| `lead` | 0.25 with audio, else 0 | silence before the audio |
| `pad_after` | 0.6 | pause after the audio (or after the last mark) |

Example: `{"Update rule:2": {"pad_after": 1.0}, "Update rule:concl": {"hold": 2}}`. Rebuild after editing.

Built-in durations (`DECK.T`, seconds): fade 0.45, draw 0.7, drawSlow 1.4, drawDelay 0.1, slide change 0.35, morph 0.9. Marks (`DECK.MK`): draw 0.5, fadeOut 0.3, gap without audio 0.9, laserHold 1.5. With `prefers-reduced-motion` (except `?mode=video`) every step is shown in its final state.

## Themes

Resolution: `--theme` > `<html data-theme>` > `default`. A name is looked up as a path relative to the deck folder, then `<deck>/themes/<name>/`, then `themes/<name>/`; the folder must contain `tokens.css`.

| `theme.json` field | Meaning |
|---|---|
| `extends` | parent theme: its `tokens.css` is placed first (looked up next to this theme, then in `themes/`) |
| `logos` | image files (relative to the theme folder; png, jpg, svg, webp) placed on every cover. Inherited through `extends` when omitted; `"logos": []` removes them |
| `name` | informational |

| Token | Meaning |
|---|---|
| `--base` | base color; the others derive from it in `themes/default/tokens.css` |
| `--emph-hue` | hue of `--emph` (default 27, red) |
| `--fg` `--bg` `--title` `--term` `--emph` `--muted` `--line` `--rule` | text, background, headings, terms, conclusions, known results, thin lines, heading rule |
| `--complement` `--accent2` `--base-tint` `--base-wash` `--comp-tint` `--term-tint` `--emph-tint` | derived colors and tints (`--term-tint`: `.thm`; `--base-wash`: `.box`; `--emph-tint`: lecture highlight) |
| `--series-1` … `--series-4` | figure series colors |
| `--font-sans`, `--weight-body` | font family and body weight |
| `--cover-bg`, `--logo-h` | cover background, logo height (128px) |
| `--sec-bg`, `--sec-fg` | divider background (`--base`) and text (white) |
| `--concl-bg` | conclusion line background (transparent) |
| `--stage-bg` | area around the slide and blackout (#2f2f2f) |

Fonts: Japanese decks (`lang` is `ja` or missing) embed BIZ UDPGothic; other languages embed Source Sans 3 and use BIZ UDPGothic only for characters past U+024F. Only the font files (or, with `fonts/*.ttf` and uv, the glyphs) that the deck uses are embedded.

## Components

The list of components and their props is [components/CATALOG.md](../components/CATALOG.md) (generated by `node tools/catalog.mjs` from each README's frontmatter). The component API (`DECK.define`, `DECK.MotionElement`, `static steps`, `static props` with `type: number | bool | json | string`, `mount`, `duration`, `cues`, `render`) is in [contract §3](contract.md#3-部品web-components) and [skills/motion-components](../skills/motion-components/SKILL.md).

Helpers on `DECK` for components: `el(tag, attrs, parent)` (SVG; `var()` colors moved to `style`), `mtext(parent, x, y, "*x*_0", attrs)`, `svgMath(parent, x, y, tex, {size, anchor, color, w, h})`, `Plot(box, {xr, yr, xt, yt, xf, yf, xl, xl2, yl, noY, m})` with `.x() .y() .d(f, a, b, n) .poly(pts) .clip`, `prog(t, start, dur)`, `lerp`, `ease`, `clamp01`, `color(name)`.

## Presenting

### URL parameters

| Parameter | Meaning |
|---|---|
| `?mode=talk` | default: later steps hidden, current step fades in |
| `?mode=lecture` | everything visible, later steps faded (0.28), current step highlighted (`.cur`), marks in final state |
| `?mode=video` | for rendering: no tools or control bar, reduced-motion ignored |
| `?presenter=1` | presenter view (opened by `p`) |
| `?view=follow` / `?view=next` | internal: the iframes inside the presenter view |
| `#N` | open at slide N (1-based); updated while navigating |

### Keys

| Key | Action |
|---|---|
| → ↓ Space PageDown | next step |
| ← ↑ PageUp | previous step (shows it in its final state) |
| Shift+→ / Shift+↓, Shift+← / Shift+↑ | next / previous slide (step 0) |
| Home / End | first / last slide |
| digits + Enter | go to that slide |
| f | fullscreen |
| p | presenter view |
| a | autoplay from the current step (audio if any). Any navigation key stops it |
| l | lecture mode on/off |
| b | blackout on/off |
| o | overview (arrows, Home/End, Enter/Space/click to go, Esc or o to close) |
| x | laser (hides after 2 s without movement) |
| d | pen (pressure-sensitive; ink stays per slide) |
| v | fading pen (fades 0.7 s after you stop, over 0.5 s) |
| Shift+d | pen color: `--emph` → `--term` → `--fg` |
| Backspace / Shift+Backspace | while the pen or fading pen is active: clear this slide / all slides |
| Esc | leave the tool, close help |
| ? | key list (with dev-server keys when served by `server/dev.mjs`) |

### Control bar (mouse move, hides after 2.5 s)

Buttons: previous, next, autoplay/stop, laser, pen, fading pen, clear ink (this slide, in any tool), overview, lecture, presenter view, fullscreen, help. It sits in the letterbox below the slide when there are at least 44px, otherwise over the bottom edge and only when the mouse is near the bottom. Hidden in print and video.

### Presenter view

Current screen (left), next step (top right), narration of this and the next step (bottom right; Novice turns labelled), slide/step counter, autoplay button, tool buttons (laser, pen, fading pen, clear, overview, lecture), timer with reset (⟲), clock. Keys in the presenter window: → ↓ Space PageDown / ← ↑ PageUp, a, x, d, v, Shift+d, Backspace, Esc, o, l. Ink drawn on the left screen appears on the main window. Communicates by `postMessage`, so it works from `file://`.

### Print and PDF

Printing (`tools/pdf.mjs`, or the browser) shows each slide in its final state, one 1280×720 page per slide, without marks, ink, tools or the progress bar.

### Run-time API (for scripts and tests)

`DECK.seek(i, k, t, from)`, `go(i, k, animate)`, `next()`, `prev()`, `state()` → `{slide, step, max, key, mode}`, `timeline()`, `autoplay(on)`, `stepKey(i, k)`, `marks(i, k)`, `morph(i)`, `slides`, `mode`, `ready`, `NARRATION`, `AUDIO`, `MARKS`, `TIMING`, `tools.{mode, setMode, clear, help, overview}`. Events on `document`: `deck:ready`, `deck:pos` (`detail = {i, k, max, n, key, nextKey, auto}`).

## Dev server

`node server/dev.mjs <deck.html> [--port 8730] [--theme name]` (or `npm run dev -- …`). Details: [dev-server.md](dev-server.md).

| Item | Behavior |
|---|---|
| `--port n` | default 8730; if taken, tries the next ones (up to 20). `--port 0`: any free port |
| `--theme name` | same as the build option |
| listens on | 127.0.0.1 only |
| rebuilds on | deck file, `narration.md`, `timeline.json`, `macros.tex`, `audio/manifest.json`, `data/`, `figs/`, `components/`, and the repository's `kit/`, `components/`, `themes/`; the page reloads at the same slide and step |
| dev build | no glyph subsetting (faster), `data-src` on editable elements, audio from `/deck/audio/…`, build errors shown as a page |
| `e` | edit mode; double-click an `h1 h2 p li td th`, `.big .note .sub .venue .au .thm .box .lead` or a `span` in `.concl`; ⌘/Ctrl+Enter save, Esc cancel. A badge shows build warnings |
| `n` | narration drawer for the current step (and preview of the next) |
| `c` | open comments; click to jump, "resolve" to close |
| Alt+click | leave a comment for Claude Code |
| conflicts | a save is refused if the source changed since it was opened |
| files written | `deck.html` (only the edited element), `narration.md` (only that step), `comments.json`, `.cache/edits/` (last 30 copies) |
| endpoints | `GET /`, `/deck/<file>`, `/__dev/client.js`, `/__dev/events` (SSE), `GET /__dev/source?range=a-b`, `POST /__dev/edit`, `GET`/`POST /__dev/narration`, `GET /__dev/comments`, `POST /__dev/comment`, `POST /__dev/comment/resolve` |

## Checker

`node kit/check.mjs <deck.html> [--theme name] [--json]` builds in memory, opens headless Chrome, and prints results per slide. Exit code 1 if there is any error. `--json` prints `{ok, counts, results: [{slide, title, sev, msg}]}`. `--theme` checks with another theme (otherwise `<html data-theme>`).

| Check | Severity |
|---|---|
| build warnings; a narration `##` that matches no slide | warn; error |
| console errors | error |
| text visible at step 0 | info |
| title > 26 full-width units (Japanese) / > 60 characters (English) | error / warn |
| title ends with a colon | error |
| conclusion > 35 units (Japanese) / > 70 characters (English); conclusion overflows its box | error / warn; error |
| body below 565px (680px with `noconcl`) or right of 1236px | error |
| body text < 27px, table/plot text < 24px, SVG text < 24px (skipped on slides whose heading contains 文献) | error |
| です・ます in the body (Japanese) | error |
| unrendered math or KaTeX errors | error |
| mixed punctuation 、。 vs ，． across the deck (Japanese) | warn |
| a step without narration | warn |
| narration that reads a formula | warn |
| turn > 200 characters / > 60 words | info |
| contrast of `--fg --term --emph --title --accent2` vs `--bg` < 4.5:1; `--muted` < 3:1 | error; warn |
| component drawing depends on call order | error |
| mark target not found; list of marks per step | warn; info |
| morph: source slide missing, no shared `data-id`, duplicate ids; pairs | warn; info |
| timeline total and per slide | info |

## Build

`node kit/build.mjs <deck.html> [-o out.html] [--theme name] [--dev] [--embed-audio]` (or `npm run build -- …`).

| Option | Meaning |
|---|---|
| `-o file` | output (default `<deck folder>/out/<name>.html`) |
| `--theme name` | theme (see [Themes](#themes)) |
| `--dev` | add `data-src` for the editor and skip glyph subsetting (used by the dev server) |
| `--embed-audio` | embed audio as AAC 64 kbps mono (needs ffmpeg; otherwise WAV, with a warning). Without it, audio is referenced relative to the output |

The summary line shows slides, math, components, font files, narration steps, audio steps, theme and size. Caches: subset fonts in `$TMPDIR/motion-slides-fonts/` (keyed by the glyphs, the TTF file's hash and the fonttools version; `uv` runs `fonttools==4.67.0` and `brotli==1.2.0`), compressed audio in `$TMPDIR/motion-slides-audio/`. Glyphs embedded: the deck text after decoding HTML entities and `\u` escapes, strings in `<script type="application/json">` and the narration, string literals of the components used (without CJK in non-Japanese decks), printable ASCII (digits, `/` for page numbers), `Appendix`, and for Japanese decks `付録` and common Japanese punctuation. Local assets are embedded as described in [Assets](#assets-embedded-at-build-time).

## TTS

`uv run --project tts python tts/synth.py <deckdir> [options]`. Details: [video.md](video.md).

| Option | Meaning |
|---|---|
| `--voices expert=a,novice=b` | voices (over `voice.json`) |
| `--ref-dir DIR` | reference voice folder (over `IRODORI_REF_DIR`; default `tts/voices/`) |
| `--engine irodori\|voxcpm2` | over `voice.json` `engine` and the deck language |
| `--yomi FILE` | reading dictionary (over `MOTION_YOMI`; default `tts/yomi.yaml`). Japanese only |
| `--only key,…` | only these steps (`slideKey:step`) |
| `--dry-run` | no TTS: silence of estimated length (7.5 characters/s Japanese, 2.5 words/s English); separate cache |
| `--force` | ignore the audio cache |

| `voice.json` field | Meaning |
|---|---|
| `expert`, `novice` | a name (`<ref dir>/<name>.wav`) or a path (contains `/` or ends in `.wav`; relative to the deck). Defaults `alice`, `bob` |
| `lang` | language (default: `lang` of the deck's HTML — the file you pass, `<deckdir>/deck.html`, or the only `*.html` in the folder — else `ja`) |
| `engine` | `irodori` (default for Japanese) or `voxcpm2` (default otherwise) |

Writes `audio/seg_<digest>.wav`, `audio/seg_<digest>.json` and `audio/manifest.json` (steps removed from the narration are dropped from the manifest; their wav files stay). Warns if dry-run audio remains. When the server is not localhost, voice paths are not checked locally. Rebuild afterwards.

## Render and export

`node render/render.mjs <built.html> --out <dir> [options]` (opens the deck with `?mode=video`).

| Option | Meaning |
|---|---|
| `--out dir` | required |
| `--fps n` | default 30 |
| `--scale x` | default 1.5 (1920×1080) |
| `--only key,…` | only these steps; the rest stay as they are |
| `--full` | also `full.mp4`, and with two or more chapters `chapter_NN.mp4` and `chapters.json` (needs all clips) |
| `--force` | ignore `.render-cache.json` |

Outputs: `clip_NNNN.mp4`, `clip_NNNN.png`, `timeline.out.json` (`source, fps, scale, width, height, duration, clipDuration, segments[]` with `index, clip, still, key, slideKey, stepKey, i, k, title, chapter, start, dur, anim, lead, audioDur, frames, clipDur, clipStart, start_ms, end_ms, transcript, text`), `.render-cache.json`. Clips beyond the current number of steps are deleted.

`node render/export-canon.mjs <deckdir | built.html> --render <dir> --out <bundle> [--md name.md] [--canon dir]`

| Option | Meaning |
|---|---|
| `<deckdir \| built.html>` | for a built file, `narration.md` is looked up in its folder or the parent |
| `--render dir` | output of `render.mjs` |
| `--out dir` | bundle: `<md>`, `clips_per_page/`, `stills/`, `timeline.out.json` |
| `--md name` | Markdown file name (default `<deck name>_with_narration.md`) |
| `--canon dir` | canon repository for the parser check with bun (over `CANON_DIR`); skipped if absent |

Exits with 1 on errors (clip > 80 MB, turn without speaker); warns about missing narration or stills and leftover dry-run audio. Prints the canon upload command.

## Tools

| Command | Purpose |
|---|---|
| `sh tools/get-fonts.sh` | download BIZ UDPGothic TTFs into `fonts/` (enables glyph subsetting with uv) |
| `node tools/pdf.mjs <built.html> <out.pdf>` | PDF, one page per slide |
| `node tools/shot.mjs <built.html> <out.png> [i] [k] [mode]` | PNG of slide i (0-based), step k, final state |
| `node tools/catalog.mjs` | regenerate `components/CATALOG.md` |
| `node tools/narration-json.mjs <narration.md> [--voice json]` | parsed narration as JSON (used by `synth.py`) |
| `node tools/smoke.mjs <built.html> <outdir>` | timeline and a few screenshots |
| `node tools/test-components.mjs [name …] [--shots dir]` | build and test component demos |
| `node tools/test-tools.mjs <built.html> [outdir]` | overview, pens, laser, print, presenter ink |
| `node tools/test-controls.mjs <built.html> [outdir]` | control bar, help, presenter buttons |
| `node tools/test-autoplay.mjs <built.html>` | autoplay and its presenter-view button |
| `node tools/test-dev-server.mjs [workdir]` | dev server on a copy of `examples/minimal` |
| `node tools/flake.mjs <built.html> <i> <k> <outdir>` | investigate a false "depends on call order" report |

## Environment variables

| Variable | Used by | Meaning | Default |
|---|---|---|---|
| `CHROME_PATH` | check, pdf, shot, render, tests | browser executable | Google Chrome, then Playwright's Chromium |
| `IRODORI_URL` | TTS | OpenAI-compatible speech server | `http://localhost:8882` |
| `IRODORI_REF_DIR` | TTS | reference voice folder (`--ref-dir` wins) | `tts/voices/` |
| `MOTION_YOMI` | TTS | reading dictionary (`--yomi` wins) | `tts/yomi.yaml` |
| `CANON_DIR` | export-canon | canon repository (`--canon` wins) | none (check skipped) |
