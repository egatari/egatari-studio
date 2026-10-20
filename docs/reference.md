<!-- i18n: pair=reference.ja.md sha256=330b90c2c88f804e -->
# Reference

English | [日本語](reference.ja.md)

Every user-facing option, syntax and key, one line each, taken from the code. The reasons and the exact rules (position and time, timeline formula, marks, morphs) are in [contract.md](contract.md). Workflow guides: [README](../README.md), [dev-server.md](dev-server.md), [video.md](video.md).

Contents: [Deck syntax](#deck-syntax) · [Narration](#narration-narrationmd) · [Timing](#timing-timelinejson) · [Themes](#themes) · [Components](#components) · [Presenting](#presenting) · [Dev server](#dev-server) · [Quality checker](#quality-checker) · [Build](#build) · [TTS](#tts) · [Render and export](#render-and-export) · [Tools](#tools) · [Environment variables](#environment-variables)

## Deck syntax

### Files in the working folder

| File | Read by | Purpose |
|---|---|---|
| `deck.html` | build | the slides (any name; `examples/minimal/deck.html` is the template) |
| `narration.md` | build, TTS, export | narration per step |
| `timeline.json` | build | per-step timing overrides |
| `macros.tex` | build | KaTeX macros (`\newcommand`, `\renewcommand`, `\def`; added to the default macros) |
| `audio/manifest.json` | build | written by `tts/synth.py` and the editor app's Audio panel (each step: `file`, `dur`, `cues`, `sync`, `kind`, `inputHash`, for TTS `recipe`; optional `processing` and `startOffset`, the encoder delay at which playback starts) |
| `voice.json` | TTS | voices, language, engine |
| `figs/*.svg`, `data/*.json` | build | for `{{FIG:…}}` / `{{JSON:…}}` |
| `components/<name>/index.js` | build | deck-local components (found before the library's) |
| `egatari.json` | build, single file | `docId`, metadata, attachments; `components` pins library component versions (`{"bars": "1.0.0"}`, format spec §3.3; a single file's copy carries the versions its export used, and unpacking writes them, so a rebuild does not switch versions; without a pin the build uses the default in `components.lock.json`) |
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
| `class="… layout-tate"` | fully vertical slide: the heading in a vertical column at the right edge, the body in vertical writing to its left, the conclusion as a vertical column at the left edge ([Japanese language arts](#japanese-language-arts-kokugo)) |
| `id="…"` on a section | slide key (overrides the heading). Use when two headings are the same. See [Slide keys](#slide-keys) |
| `data-morph` / `data-morph="key"` | morph in from the previous slide / from the slide with that key ([contract §8](contract.md#8-morphs-data-morph)) |
| `data-chapter="name"` | start a chapter here with this name (like a `sec` slide) |
| `data-steps="n"` | minimum number of steps (for legacy `data-anim`) |
| `data-anim="name"` | legacy animation: calls `DECK.ANIM[name](slide, k, instant)`; in video it shows only each step's final state. Write components instead |
| `<div class="pn">` as a direct child | your own page number (otherwise one is added from slide 2 on: `i/N`) |
| `<html lang="en">` | English deck: Source Sans 3 body font, English UI text, English quality-check standards, `voxcpm2` TTS |
| `<html data-theme="name">` | theme (overridden by `--theme`) |
| `<html data-mode="lecture">` | default mode when the URL has no `?mode=` |
| `<html data-feedback-url="URL">` | where **Send feedback** points (default `https://github.com/egatari/egatari-studio/issues/new`). For a GitHub `/issues/new` URL, `template=feedback.yml` is added; `version`, `browser`, `os` and `context` (lang, mode) are added as query parameters |
| `<html data-feedback="off">` | no feedback link in the `?` help or the presenter view (`DECK.FEEDBACK_URL = null`) |
| `<html data-font="mincho">` | body text in BIZ UDPMincho (`--font-sans: var(--font-mincho)`); see [Japanese language arts](#japanese-language-arts-kokugo) |

Body classes (all colors come from the theme): `.sub` subheading · `.big` main equation · `.note` note (27px) · `.thm` theorem box · `.box` tinted box · `.cols` side-by-side columns · `.arrow` centered arrow line · `.fig` / `.figcap` figure and caption · `.cite` citation (20px) · `.plot` box for `DECK.Plot` · `.readout .num` tabular number · `td.r` right-aligned cell · `.term`/`.blue`, `.emph`/`.red`, `.muted`/`.gray`, `.b` colors and bold · `.tate` vertical writing · `.mincho` Mincho · `.tcy` upright digits in vertical text · `<ruby>` readings ([Japanese language arts](#japanese-language-arts-kokugo)).

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
| `data-id="ID"` | morph pairing ([contract §8](contract.md#8-morphs-data-morph)) |
| `id="ID"` / `data-mark="ID"` | target of `{mark:ID}` ([contract §7](contract.md#7-attention-marks-mark)) |
| `data-key`, `data-title` | added by build (slide key, plain heading). A hand-written `data-key` on a section without `id` is used as the slide key (legacy; the quality checker warns); see [Slide keys](#slide-keys) |

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
| KaTeX errors | build warns and shows the source in red (`.katex-error`); the quality checker reports it as an error |
| `DECK.svgMath(…)` in a component or deck script | KaTeX is also embedded at run time (with the same macros) |

### Includes

| Syntax | Meaning |
|---|---|
| `/*INCLUDE:file*/` | file contents inserted verbatim (working folder, then `kit/`). A path that leaves these folders (`../`, absolute, symbolic link) is refused with a warning and replaced by nothing |
| `{{FIG:name}}` | `figs/name.svg` (or `name.svg` in the working folder) inlined; ids prefixed with `name-`, width/height removed |
| `{{JSON:file}}` | JSON from `data/` (or the working folder), minified. Put it in `<script type="application/json">` inside a component to read it as `this.data` |
| `<m-name …>` | component; `components/name/index.js` in the deck, else the library copy `vendor/components/name/<version>/index.js`, loaded automatically |

`{{FIG:…}}`, `{{JSON:…}}`, `narration.md`, `timeline.json`, `macros.tex` and the files in `audio/manifest.json` are read only if they resolve (after following symbolic links) inside the working folder; otherwise the build warns (`refused: …`) and skips them.

### Assets (embedded at build time)

| Reference | Becomes |
|---|---|
| `<img src>`, `<source src/srcset>`, `<img srcset>`, `<video src/poster>`, `<audio src>`, `<track src>`, SVG `<image href>` | `data:` URI |
| `url(…)` and `@import` in the deck's `<style>` and `style=""` attributes | `data:` URI / the imported CSS inlined (`url()` in a linked or imported CSS file is relative to that file) |
| `<link rel="stylesheet" href="file.css">` | `<style>` with the file's contents |
| `<link rel="icon">` and other `<link>` files, `<script src="file.js">` | `data:` URI / inline script |

Relative paths are resolved from the working folder and must stay inside it. `data:`, `blob:`, `#fragment` and template values (`${…}`, `{{…}}`) are left as they are. Warnings: `missing: …` (file not found), `refused: …` (outside the working folder), `external: …` (an `http(s)` reference in an asset position, including `<iframe>`/`<object>`: left as it is, so the deck is not fully offline). Ordinary links (`<a href>`) are not touched. Audio from `audio/manifest.json` is embedded only with `--embed-audio`.

### Slide keys

Each slide gets one key ([contract §4](contract.md#4-narration-narrationmd)): the section's `id`, else a hand-written `data-key`, else the normalized heading (tags removed, `&nbsp;` as a space, all whitespace removed), else `s<n>`. Give every slide an id (`npm run new` does; `npm run ids -- <deck>` adds them to an existing deck). Ids match `^[A-Za-z][A-Za-z0-9_-]{0,63}$` and must not equal any other id in the deck, including mark targets and `\htmlId{…}`. Duplicate keys make the deck invalid (the quality checker reports an error); so that it still builds, the build warns (`slide key: …`) and gives the later slides a suffix `#2`, `#3`, …. The final key is written to the section's `data-key`.

## Narration (narration.md)

| Syntax | Meaning |
|---|---|
| `## heading {#s-k3f9q2}` | slide with that id (recommended; the id wins over the heading text) |
| `## s-k3f9q2` | slide with that id |
| `## heading` | legacy, slide without id: the heading text without tags and whitespace |
| `[0]` `[1]` … `[concl]` | narration for that step; following lines continue it. Steps are `0`–`999` without leading zeros (`[01]` is not a step) |
| `@x-<name>-<field> <value>` | extension line inside a step: kept as data for the step, never shown or spoken, not hashed |
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

Build warns about a `##` that matches no slide (the quality checker makes this an error), a step number that is not canonical, an invalid `{#id}`, unknown mark effects, and mark targets not found in the source.

## Timing (timeline.json)

`dur = override.dur ?? max(anim, audio ? lead + audio + pad_after : max(hold, marksEnd + pad_after))` ([contract §5](contract.md#5-timeline)).

| Key in `"slideKey:step"` | Default | Meaning |
|---|---|---|
| `dur` | — | fixed length (s); audio past `lead + dur` is cut |
| `hold` | 1.2 | length of a step without audio |
| `lead` | 0.25 with audio, else 0 | silence before the audio |
| `pad_after` | 0.6 | pause after the audio (or after the last mark) |

Example: `{"Update rule:2": {"pad_after": 1.0}, "Update rule:concl": {"hold": 2}}`. Rebuild after editing.

Built-in durations (`DECK.T`, seconds): fade 0.45, draw 0.7, drawSlow 1.4, drawDelay 0.1, slide change 0.35, morph 0.9. Marks (`DECK.MK`): draw 0.5, fadeOut 0.3, gap without audio 0.9, laserHold 1.5. With `prefers-reduced-motion` (except `?mode=video`) every step is shown in its final state.

## Themes

Resolution: `--theme` > `<html data-theme>` > `default`. A name is looked up as a path relative to the working folder, then `<deck>/themes/<name>/`, then in your theme folders (each folder of `EGATARI_THEMES` in order, then `~/.egatari/themes` if it exists), then the bundled `themes/<name>/`; the folder must contain `tokens.css`. `EGATARI_THEMES` is a list of folders separated by the OS path delimiter (`:`, or `;` on Windows); a folder in it that does not exist is skipped with a warning. Before anything is read, `theme.json`, `tokens.css`, logos and every parent theme (`extends`, at any depth) must resolve, by real path, inside the theme's authorized root: the working folder for a theme of the deck, `themes/` for a registry theme, the theme folder (its real path, computed once, so `~/.egatari/themes` may be a symbolic link) for a theme in your theme folders, the theme folder itself for one given with `--theme`. A parent may also come from your theme folders or `themes/`; `"extends": "default"` is the bundled `default` unless a theme folder has its own `default`. Otherwise the build warns (`refused: …`) and does not read it; a refused deck theme falls back to `default` ([format spec](https://github.com/egatari/egatari-spec) §11). A theme named by the deck (or by `extends`) that is found nowhere is not an error: the build warns `theme not found: "<name>" …` and uses `default` (or no parent); a `--theme` that is not found is an error. The editor app does not see `EGATARI_THEMES` or `~/.egatari/themes`: there you choose one theme folder (**Choose theme folder…**, read only), which takes the place of your theme folders in the same order and under the same rules ([editor](editor.md)); without it, or with the deck's `themes/`, a deck whose theme is only in your theme folders shows that warning. A single file (`.ega.html`) stores a theme from your theme folders as the deck's `themes/<name>/`, so it rebuilds with the same theme anywhere. Deeper than 16 levels of `extends` is an error.

| `theme.json` field | Meaning |
|---|---|
| `extends` | parent theme: its `tokens.css` is placed first (looked up next to this theme, then in your theme folders, then in `themes/`) |
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
| `--cap-size`, `--cap-bottom`, `--cap-side`, `--cap-max-lines` | caption font size (27px), distance from the bottom (18px), side margins (96px), max lines per caption chunk (3) |
| `--cap-rate` | caption reading speed when presenting by hand (characters/s; default ja 7, en 15; also `DECK.captionRate`) |

Fonts: Japanese decks (`lang` is `ja` or missing) embed BIZ UDPGothic; other languages embed Source Sans 3 and use BIZ UDPGothic only for characters past U+024F. Only the font files (or, with `fonts/*.ttf` and uv, the glyphs) that the deck uses are embedded. BIZ UDPMincho is embedded as well, for the same characters, only when the deck uses it: `var(--font-mincho)` in the deck, its theme or a component it uses, `class="mincho"`, or `<html data-font="mincho">` (the definition of `--font-mincho` in `kit/layouts.css` does not count). `--font-mincho` is defined with `:where(:root)`, so a theme can override it. Theme `kokugo`: Mincho body text, indigo base, vermilion emphasis, off-white background, captions in BIZ UDPGothic (`--font-cap`).

| Token | Meaning |
|---|---|
| `--font-mincho` | Mincho family (`"BIZ UDPMincho", "Hiragino Mincho ProN", "Yu Mincho", serif`) |
| `--font-cap` | caption font (default `--font-sans`) |

## Components

The list of components and their props is [vendor/components/CATALOG.md](../vendor/components/CATALOG.md) (generated by `node tools/catalog.mjs` from the frontmatter of each README, default versions). The components come from [egatari/components](https://github.com/egatari/components): Studio carries copies of its releases in `vendor/components/<name>/<version>/`, pinned in `components.lock.json`; `npm run components:update -- vX.Y.Z` brings in a release (the only networked step: it checks the tarball against the release's `manifest.json` and keeps every version), `npm run components:check` checks the copies against the lock (in `npm test`). New components are proposed in [egatari/components issues](https://github.com/egatari/components/issues/new?template=proposal.yml). The component API (`DECK.define`, `DECK.MotionElement`, `static steps`, `static props` with `type: number | bool | json | string`, `mount`, `duration`, `cues`, `render`) is in [contract §3](contract.md#3-components-web-components) and [skills/motion-components](../skills/motion-components/SKILL.md).

Helpers on `DECK` for components: `el(tag, attrs, parent)` (SVG; `var()` colors moved to `style`), `mtext(parent, x, y, "*x*_0", attrs)`, `svgMath(parent, x, y, tex, {size, anchor, color, w, h})`, `Plot(box, {xr, yr, xt, yt, xf, yf, xl, xl2, yl, noY, m})` with `.x() .y() .d(f, a, b, n) .poly(pts) .clip`, `prog(t, start, dur)`, `lerp`, `ease`, `clamp01`, `color(name)`.

**Links to slides and menus.** `<a href="#<slide id>">` and `<a href="#<slide id>:<stepKey>">` are ordinary links to a slide or a step (no script; allowed in Core documents); the runtime follows them inside the document and offers Back ([contract §9](contract.md#9-links-to-slides)). Use the ids that `npm run ids` assigns. **`m-menu`** lays such links out as a grid of cards (title, `data-sub` subtitle, `data-icon` badge, an optional "visited" check for slides shown in this session, cards appearing by step with `per-step`): [vendor/components/menu/1.0.2/README.md](../vendor/components/menu/1.0.2/README.md); example: slide 2 of [`examples/kokugo-kanbun`](../examples/kokugo-kanbun). Links inside slides take `--term` with an underline.

### Japanese language arts (kokugo)

For 国語 lessons (kanbun, classical and modern Japanese). The example is [`examples/kokugo-kanbun`](../examples/kokugo-kanbun) (theme `kokugo`).

- **Vertical writing**: `<div class="tate">…</div>` inside `.body` sets the text in `writing-mode: vertical-rl`, filling the height of the body, columns from right to left (paragraphs are separated to the left; `p.indent` indents the first line). `.tcy` sets two-digit numbers upright
- **Vertical slides**: `<section class="slide layout-tate">` sets the whole slide vertically. The `<h2>` is one vertical column at the right edge (1166–1232px, from 48px down, top-aligned); the theme's heading rule becomes a vertical rule on the left of that column, and the column does not wrap (about 14 full-width characters; the quality checker reports a longer one). The `.body` (148–1138px, 48–664px; from 48px with `noconcl`) is in `writing-mode: vertical-rl`: paragraphs and lists run in columns from right to left, and a `.tate` block fills it. Components, figures and tables in it (direct children other than `p`, `ul`, `ol`, `.sub`, `.note`, `.arrow`, `.tate`, `.box`, `.thm`, `h3`, `blockquote`) stay horizontal at the full body width, since they measure their own box; use their vertical option (`m-kobun tate`, `m-gendai tate`; `m-kanbun` is always vertical). The `.concl` is a vertical column at the left edge (48–120px; about 19 characters). The page number stays at the bottom right, below the heading column. Only the CSS changes: slide keys, captions and the readable layer of a single file take the heading text as before. Example: the 現代文 slide of [`examples/kokugo-kanbun`](../examples/kokugo-kanbun); tests: `tools/test-layout-tate.mjs`
- **Ruby**: `<ruby>漢<rt>かん</rt></ruby>`; `rt` is 0.5em and the quality checker does not count its size. In vertical text the reading is on the right
- **Mincho**: `.mincho` or `<html data-font="mincho">`, or a theme that sets `--font-sans: var(--font-mincho)` (theme `kokugo`)
- **`m-kanbun`**: kanbun in vertical writing. One line per column; after a character: `(送り仮名)`, `[返り点]` (`レ`, `一二三四五`, `上中下`, `甲乙丙丁`, `天地人`, `一レ`, `上レ`, …; a bare `レ` also works), `{振り仮名}`, `{=かな}` (written in hiragana in the 書き下し文, e.g. `不{=ず}`), `{-}` (置き字, not read), `(右|二度目)` (再読文字, e.g. `未(ダ|ず)`), `-` (竪点), `、` `。`. Steps: 白文 → `kunten` (返り点 lower left, 送り仮名 lower right) → `order` (characters highlighted in kundoku order, an arc where the eye jumps back; `cues(k)` at the start of each column) → `kaki` (書き下し文 on the left). Rules and details: [vendor/components/kanbun/1.0.2/README.md](../vendor/components/kanbun/1.0.2/README.md)
- **`m-kobun`**: classical Japanese split into words (`春[名]/は[係助]/…`), colored by part of speech, one sentence per step, and a modern translation (`= …` lines) in the last step. Clicking (or Enter on) an auxiliary verb `[助動・基本形・意味・活用形]` opens a card with its conjugation table and meanings, taken from a table inside the component (no network, text only). The card is a presenting control outside `DECK.seek(i, k, t)`: it closes when the step changes, never opens in video mode and is not printed. [vendor/components/kobun/1.0.2/README.md](../vendor/components/kobun/1.0.2/README.md)
- **`m-gendai`**: modern Japanese: `__傍線__`, `==二重傍線==`, `{語句|_A,#id}` / `{これ|>id}` (an arrow from a demonstrative to what it refers to), paragraphs `@主張#p3`, `@具体例#p1>p3`, `@対比#p2~p1` boxed by role and joined by lines. Horizontal or `tate`. [vendor/components/gendai/1.0.2/README.md](../vendor/components/gendai/1.0.2/README.md)

## Presenting

### URL parameters

| Parameter | Meaning |
|---|---|
| `?mode=talk` | default: later steps hidden, current step fades in |
| `?mode=lecture` | everything visible, later steps faded (0.28), current step highlighted (`.cur`), marks in final state |
| `?mode=video` | for rendering: no tools or control bar, reduced-motion ignored |
| `?captions=1` | start with captions on (same as `s`). With `?mode=video` this is the only way to get captions, so a render can burn them in |
| `?capsize=s` / `m` / `l` | caption size (22 / 27 / 34px); overrides the remembered size; ignored with `?mode=video` |
| `?presenter=1` | presenter view (opened by `p`) |
| `?view=follow` / `?view=next` | internal: the iframes inside the presenter view |
| `#N` | open at slide N (1-based); updated while navigating |
| `#<slide id>` / `#<slide id>:<stepKey>` | open at that slide (step 0) or step (`0`, `1`, … or `concl`), in its final state ([contract §9](contract.md#9-links-to-slides)) |
| `?embed=1` | in a frame: post `{egatari:"position", slideKey, stepKey, t, cause}` to the parent on every step change and accept `{egatari:"links", follow}` from it |
| `?links=0` | with `?embed=1`: links to slides do not move the player; it posts `{egatari:"linkRefused", slideKey, stepKey}` instead |

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
| s | captions on/off: the current step's narration (display text) at the bottom of the slide |
| Shift+s | caption size: S → M → L (22 / 27 / 34px), with a brief notice; the last choice is remembered (localStorage) |
| o | overview (arrows, Home/End, Enter/Space/click to go, Esc or o to close) |
| x | laser (hides after 2 s without movement) |
| d | pen (pressure-sensitive; ink stays per slide) |
| v | fading pen (fades 0.7 s after you stop, over 0.5 s) |
| Shift+d | pen color: `--emph` → `--term` → `--fg` (Red, Blue, Black), with a brief notice "Pen color: Blue" |
| Backspace / Shift+Backspace | while the pen or fading pen is active: clear this slide / all slides |
| Backspace / Alt+← | otherwise, after following a link to a slide: back to where the link was clicked (also the **Back** button at the top left and the browser's back button) |
| Tab / Shift+Tab | focus the control-bar buttons (Enter / Space presses; Esc returns to the slide) |
| Esc | leave the tool, close help |
| ? | key list (with dev-server keys when served by `server/dev.mjs`) |

### Control bar (mouse move, hides after 2.5 s)

Buttons: previous, next, autoplay/stop, laser, pen, fading pen (both pen buttons carry a dot in the current color; while a pen is active, Red/Blue/Black swatches appear after them; click one to pick it, the selected one is aria-pressed), clear ink (this slide, in any tool), overview, lecture, captions, presenter view, fullscreen, help, and a small “AI voice” badge when any step's audio is TTS (format spec §7.3). Tab moves into the bar (it stays visible while it has focus), Enter/Space presses the focused button and keeps focus there, Esc returns focus to the slide; a mouse click never leaves focus on a button. It sits in the letterbox below the slide when there are at least 44px, otherwise over the bottom edge and only when the mouse is near the bottom. Hidden in print and video.

The `?` help ends with a **Send feedback** link and the version (for example `v0.2.0`). It opens the feedback form prefilled with the version, browser, OS, deck language and mode only; nothing from the deck is sent. Not shown in video or print, or with `data-feedback="off"`.

### Captions

`s`, the CC button, or `?captions=1` shows the current step's narration (the display text of `narration.md`, readings and `{mark}` removed) in a bar at the bottom of the slide: `--fg` background, `--bg` text (the quality checker keeps their contrast ≥ 4.5:1). The step is split into sentence groups (about two lines; shorter at larger sizes; overlong sentences are split at commas or word boundaries) and one group is shown at a time, at most `--cap-max-lines` (3) lines; if a group still overflows, its last lines are shown. While presenting by hand (and in autoplay without audio) the groups advance at reading speed (ja 7 characters/s, en 15; `--cap-rate` or `DECK.captionRate`), restart at every step change, and the last group stays. During autoplay with audio, and in `?mode=video&captions=1`, each group is shown for a share of the audio proportional to its length (in video without audio the whole step is shown); the size is set with `Shift+s`, `?capsize=` or the theme's `--cap-size`; in video this depends only on `(i, k, t)`. When the control bar sits over the bottom edge, the captions move up above it while it is shown and back down when it hides. Never printed. `render/render.mjs` opens `?mode=video` without captions; pass the parameter there to burn them in.

### Accessibility

Not added in `?mode=video` or the presenter-view iframes, and none of it changes pixels.

- Screen readers: a visually hidden `aria-live="polite"` region (`#deck-live`) announces "Slide n of N: title" on a slide change, the text of the newly revealed step on the next step (math read from KaTeX's glyphs), or "Step k of K" when going back or when a step reveals no text. Each slide is `role="group"` with `aria-roledescription="slide"` and an `aria-label`; hidden slides get `aria-hidden="true"` and `inert`, and in talk mode steps not yet shown are `aria-hidden` (lecture mode leaves them readable).
- Keyboard: control-bar and presenter-view buttons have `aria-label` (Japanese or English after `<html lang>`), toggles have `aria-pressed`, and a focus ring appears only on `:focus-visible`. The overview is a `dialog` whose thumbnails are labelled buttons; focus follows the arrow keys and returns to where it was on Esc. The help (`?`) is a `dialog` that takes focus and gives it back on close. The ink layer is `aria-hidden` and never takes focus, so Tab and Esc keep working while drawing.
- `prefers-reduced-motion` shows every step in its final state (except in video).
- The quality checker warns about `<img>` without `alt` (`alt=""` marks decoration) and SVG figures without `aria-label` / `aria-labelledby` / `<title>`, and lists components without a name (info).

### Presenter view

Current screen (left), next step (top right), narration of this and the next step (bottom right; Novice turns labelled), slide/step counter, autoplay button, tool buttons (laser, pen, fading pen, clear, overview, lecture; while a pen is active, the same Red/Blue/Black swatches, synced with the main window by color index), timer with reset (⟲), clock. Keys in the presenter window: → ↓ Space PageDown / ← ↑ PageUp, a, x, d, v, Shift+d, Backspace, Esc, o, l. Ink drawn on the left screen appears on the main window. Communicates by `postMessage`, so it works from `file://`. The key row ends with a **Send feedback** link (same as in the `?` help).

### Print and PDF

Printing (`tools/pdf.mjs`, or the browser) shows each slide in its final state, one 1280×720 page per slide, without marks, ink, tools or the progress bar.

### Run-time API (for scripts and tests)

`DECK.seek(i, k, t, from)`, `go(i, k, animate)`, `next()`, `prev()`, `state()` → `{slide, step, max, key, mode}`, `timeline()`, `autoplay(on)`, `stepKey(i, k)`, `marks(i, k)`, `morph(i)`, `slides`, `mode`, `ready`, `NARRATION`, `AUDIO`, `MARKS`, `TIMING`, `VERSION` (the `version` in `package.json`, embedded by the build), `FEEDBACK_URL` (or `null`), `feedbackUrl()` (the prefilled form URL, or `null`), `tools.{mode, setMode, clear, help, overview, color}` (`color()` is the pen color index 0–2, `color(n)` sets it), `captions(on)` (no argument: is it on), `captionSize(z)` (`"s"` / `"m"` / `"l"`; no argument: the current size; `null` in video), `captionRate` (characters/s), `toast(msg)` (brief notice), `caption()` (the caption text shown, or `null`), `announce()` (the live-region text), `resolveFragment(f)` (→ `{i, k, key, id}` or `{error}`), `fragment(i, k)`, `follow(f)`, `back()`, `links()` (→ `{depth, follow, back}`), `visited(i | key)` ([contract §9](contract.md#9-links-to-slides)). Events on `document` also include `deck:captions` (`detail = {on}`). Events on `document`: `deck:ready`, `deck:pos` (`detail = {i, k, max, n, key, nextKey, auto, cause, back}`; `cause` is `control`, `link`, `seek` or `play`, `back` the title of the slide Back returns to or `null`).

## Dev server

`node server/dev.mjs <deck.html> [--port 8730] [--theme name]` (or `npm run dev -- …`). Details: [dev-server.md](dev-server.md).

| Item | Behavior |
|---|---|
| `--port n` | default 8730; if taken, tries the next ones (up to 20). `--port 0`: any free port |
| `--theme name` | same as the build option |
| listens on | 127.0.0.1 only |
| rebuilds on | deck file, `narration.md`, `timeline.json`, `macros.tex`, `audio/manifest.json`, `data/`, `figs/`, `components/`, the repository's `kit/`, `vendor/components/`, `themes/`, and your theme folders (`EGATARI_THEMES`, `~/.egatari/themes`); the page reloads at the same slide and step |
| dev build | no glyph subsetting (faster), `data-src` on editable elements, audio from `/deck/audio/…`, build errors shown as a page |
| `e` | edit mode; double-click an `h1 h2 p li td th`, `.big .note .sub .venue .au .thm .box .lead` or a `span` in `.concl`; ⌘/Ctrl+Enter save, Esc cancel. A badge shows build warnings |
| `n` | narration drawer for the current step (and preview of the next) |
| `c` | open comments; click to jump, "resolve" to close |
| Alt+click (on a Mac: ⌥ Option+click) | leave a note for the AI (`comments.json`) |
| conflicts | a save is refused if the source changed since it was opened |
| files written | `deck.html` (only the edited element), `narration.md` (only that step), `comments.json`, `.cache/edits/` (last 30 copies) |
| endpoints | `GET /` (frame page; `?presenter=1`: presenter window), `GET /preview` (the deck document, sandboxed; the only framable endpoint; served only with the frame page's `cap` and `Sec-Fetch-Dest: iframe`, otherwise a 403 text page), `/deck/<file>` (inert: CSP `sandbox`, non-media as `text/plain` attachments), `/__dev/shell.js`, `/__dev/editor-ui.js`, `/__dev/presenter.js`, `/__dev/events` (SSE), `GET /__dev/info`, `GET /__dev/source?range=a-b`, `POST /__dev/edit`, `GET`/`POST /__dev/narration`, `GET /__dev/comments`, `POST /__dev/comment`, `POST /__dev/comment/resolve` |

## Quality checker

Quality control in Egatari has three parts: the **standards** (`R-fit`, `R-steps`, … in the [authoring guide](authoring-with-llms.md)), the **quality check** that reports **findings** against them, and the **fix request** that hands the findings to an AI. The quality checker comes as a command (`npm run check`, below, with every check) and in the browser ([editor app](editor.md), a subset).

`node kit/check.mjs <deck.html> [--theme name] [--lang ja|en] [--json]` builds in memory, opens headless Chrome, and prints results per slide. Exit code 1 if there is any error. `--theme` checks with another theme (otherwise `<html data-theme>`). Each finding (error or warning) says where (slide number, heading, id, step), what is wrong and how to fix it, with the id of the standard in the [authoring guide](authoring-with-llms.md) where one applies (for example `(R-title)`), so the findings can be pasted into a fix request as they are. `--lang` chooses the language of the findings (default: the deck's `<html lang>`, Japanese when it is `ja` or missing, otherwise English).

`--json` prints:

```json
{"ok": false, "lang": "en", "counts": {"error": 1, "warn": 0, "info": 12},
 "results": [{"slide": 2, "id": "s-k3f9q2", "key": "s-k3f9q2", "title": "The decay law", "step": "3",
              "sev": "error", "code": "narrOrphan", "rule": "R-narr-steps", "data": {…},
              "msg": "Slide 2 “The decay law” (s-k3f9q2), step 3: narration [3] has no matching step … (R-narr-steps)"}]}
```

| Field | Meaning |
|---|---|
| `slide` | slide number, from 1; `null` for the whole deck |
| `id` | the slide's `id`, or `null` (a slide without id, or the whole deck) |
| `key` | the slide key (the id, or the legacy key from the heading) |
| `title` | the heading text of the slide (`h2` / `h1`, without tags) |
| `step` | the step the result is about: `"0"`, `"1"`, … or `"concl"`; `null` when it is about the whole slide |
| `sev` | `error`, `warn` or `info` |
| `code` | the kind of result (stable; the list is `kit/check-messages.mjs`) |
| `rule` | the id of the standard in the authoring guide (`R-title`, `R-fit`, …), or `null` |
| `data` | the values of the result (e.g. `{"px": 583, "lim": 565, "concl": true}` for a body overflow), used by fix requests to give the amount to cut |
| `msg` | the whole finding in `lang`: where, what and how to fix |

| Quality check | Severity |
|---|---|
| build warnings; a narration `##` that matches no slide, a non-canonical step number (`[01]`), an invalid `{#id}` | warn; error |
| slide id not matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$` (`slide id: …`); two slides with the same key (`slide key: …`); a slide id equal to another id or `\htmlId{…}` in the deck (`slide id: …`) | error |
| the heading text of a `## heading {#id}` differs from that slide's heading (the id wins) | info |
| a slide keyed by a legacy rule: a hand-written `data-key`, or `s<n>` (no id and no heading) — `slide key: legacy` | warn |
| a link to a slide (`#<id>`, `#<id>:<stepKey>`, `#N`) whose slide does not exist, whose step is out of range, or `:concl` on a slide without a conclusion; a link `#N` or to a slide without an id; a relative link to a file that does not exist ([contract §9](contract.md#9-links-to-slides)) | error; warn; warn |
| a component's data does not match its declared shape (`static shape`), or the component throws while drawing (`compData`: which component, what differs (path, expected, got), its shape and an example; standard R-components). The step count of a slide also comes from its `data-step` elements and `.concl`, so a failing component does not turn the slide's narration into orphans | error |
| console errors (the message only: stack lines and file paths, temp folders and local-server URLs are removed) | error |
| text visible at step 0 | info |
| title > 26 full-width units (Japanese) / > 60 characters (English) | error / warn |
| title ends with a colon | error |
| `layout-tate`: the vertical title does not fit its column | error |
| conclusion > 35 units (Japanese) / > 70 characters (English); conclusion overflows its box (also the vertical column of `layout-tate`) | error / warn; error |
| body below 565px (680px with `noconcl`) or right of 1236px; with `layout-tate`: below 680px, right of 1162px (over the heading column), left of 124px (over the conclusion column; 44px without one) | error |
| body text < 27px, table/plot text < 24px, SVG text < 24px (skipped on slides whose heading contains 文献; ruby readings in `rt` are not counted) | error |
| text cut off by a box with `overflow` other than `visible` (`textClipped`); SVG text cut off by its viewport (viewBox) or going off the slide (`svgTextOut`); SVG text overflowing the `<rect>` around it (`svgTextBox`); text outside `.body` going off the slide or overlapping the heading, conclusion line or page number (`outsideBody`). Text inside an element with `data-clip` is not checked by these ([contract §10](contract.md#10-quality-check-intended-clipping-proposal), a proposal) | warn |
| です・ます in the body (Japanese) | error |
| unrendered math or KaTeX errors | error |
| mixed punctuation 、。 vs ，． across the deck (Japanese) | warn |
| a step without narration | warn |
| stale audio: a step's audio was made from other narration (`inputHash` differs or is `null`; without `inputHash`, the TTS cache record `audio/seg_<digest>.json` is compared) — `audio: stale` | warn |
| narration that reads a formula (each turn by the rules of its language, see below; a Japanese sentence that only names things in Latin letters, such as “Markdown と HTML”, is not a formula) | warn |
| turn > 200 characters (Japanese) / > 60 words (other languages) | info |
| the narration language differs from the slide language (`narrLang`) | info |
| contrast of `--fg --term --emph --title --accent2` vs `--bg` < 4.5:1; `--muted` < 3:1 | error; warn |
| component drawing depends on call order | error |
| mark target not found; list of marks per step | warn; info |
| morph: source slide missing, no shared `data-id`, duplicate ids; pairs | warn; info |
| `<img>` without `alt`; SVG figure without `aria-label`/`<title>`; component without a name | warn; warn; info |
| timeline total and per slide | info |

The slides and the narration may be in different languages (for example Japanese slides with English narration for subtitles). The narration language is `"lang"` in `voice.json` (as for the TTS), otherwise the language of the text when nearly all turns are in another script than the deck (no Japanese characters in a Japanese deck, or Japanese in most turns of another deck), otherwise the deck's `<html lang>`. The narration checks then take each turn by its own language: a turn with Japanese characters by the Japanese rules, an English sentence by the English rules (only `\` `^` `_` and dense operators count as a formula).

## Build

`node kit/build.mjs <deck.html | working folder> [-o out.html] [--theme name] [--dev] [--embed-audio] [--portable] [--play-only]` (or `npm run build -- …`). Given a folder, it builds the `deck.html` inside it (without one it says what it expected and exits with 1).

| Option | Meaning |
|---|---|
| `-o file` | output (default `<working folder>/out/<name>.html`) |
| `--theme name` | theme (see [Themes](#themes)) |
| `--dev` | add `data-src` for the editor and skip glyph subsetting (used by the dev server) |
| `--embed-audio` | embed audio as AAC 64 kbps mono (needs ffmpeg; otherwise WAV, with a warning). Without it, audio is referenced relative to the output |
| `--portable`, `--play-only` | a single file that also carries the source; see [Single file](#single-file---portable) |

The summary line shows slides, math, components, font files, narration steps, audio steps, theme and size. Caches: subset fonts in `$TMPDIR/motion-slides-fonts/` (keyed by the glyphs, the TTF file's hash and the fonttools version; `uv` runs `fonttools==4.67.0` and `brotli==1.2.0`), compressed audio in `$TMPDIR/motion-slides-audio/`. Glyphs embedded: the deck text after decoding HTML entities and `\u` escapes, strings in `<script type="application/json">` and the narration, string literals of the components used (without CJK in non-Japanese decks), printable ASCII (digits, `/` for page numbers), `Appendix`, and for Japanese decks `付録` and common Japanese punctuation. Local assets are embedded as described in [Assets](#assets-embedded-at-build-time).


A deck-local component (`<deck>/components/<name>/index.js`) is read only if its real path is inside the working folder, a registry component only inside `vendor/components/`; a deck-local one that resolves outside is refused with a warning and not replaced by the registry one. Inside the working folder, the output (`out/…`) and `egatari.json` are never written through a symbolic link (the file or a folder on the way); a link there makes the build fail without writing.

### Build limits

The build counts while it expands and stops with `build-too-large` as soon as a limit is exceeded: the source (32 Mi characters), includes and embeds together (`/*INCLUDE*/`, `{{JSON}}`, `{{FIG}}`, `data:` URIs, `<link rel="stylesheet">`, `<script src>`, `@import`: 10 000), the size after preprocessing (64 Mi characters) and after embedding and math (256 Mi), the tags before each parse (500 000) and formulas (20 000). Every file read counts toward the include count — theme files, logos and parent themes, components, narration, audio, fonts and the runtime too — and toward one total of what was read (`readChars`: 256 Mi; text in bytes, base64 in characters), charged from the file size before reading, so an oversized file is refused unread; the size is an estimate, and the bytes actually read are charged too (a file that grew is refused). Sizes are always bytes (text read through an adapter that does not report bytes is charged its UTF-8 length, never its UTF-16 length). Only regular files are read: a FIFO, device or socket is refused with `build-not-a-file`. The whole output is checked against 256 Mi before it is joined. Audio is compressed from the bytes charged for it: the build reads the `.wav` once, up to its charged size, and hands ffmpeg a private copy of those bytes instead of the original path. The portable export shares its build's budget for everything it reads (narration, copied sources, `voice.json`, `egatari.json`, audio before compression) and checks the whole file before it builds each part: archive chunks from their projected size, the index from a lower bound before it is serialized (and against the reader's 4 MiB `indexBytes`), and the readable layer counted in escaped characters while it is built; base64 is encoded only after every check passed. Real decks are far below (`examples/tmlr2026-calibration`: 11 KB source, 27 formulas, 3 400 tags). `build(env, src, {limits: {...}})` changes them (`BUILD_LIMITS` in `kit/core/build-core.mjs`). In the editor app the build runs in a worker that is stopped after 60 s, and reads only the files the build references, at most 8 at a time, each up to its listed size (reserved before the read starts; a file that grew since the listing is refused). Outside the build, the dev server, the editor's own requests and `npm run ids` read `deck.html` (32 MiB), `narration.md` (16 MiB) and `comments.json` (4 MiB) with fixed limits (`READ_LIMITS` in `kit/core/bounded-read-core.mjs`), and `npm run portable -- unpack` refuses an input over the format's 100 MiB before reading it. All of these go through one bounded reader (`kit/bounded-read.mjs` on Node, `app/bounded-read.js` in the browser); `tools/test-raw-reads.mjs` fails on a raw read elsewhere.

### Single file (`--portable`)

`node kit/build.mjs <deck.html> --portable` writes `out/<name>.ega.html`: one HTML file that plays like the normal build and also carries the deck's source, so it can be unpacked into a folder (or reopened by an editor) without the original folder. It follows **Egatari**, the open [portable deck format](https://github.com/egatari/egatari-spec) (draft 1.0); the file name extension, block ids and media type come from that spec.

- **What goes in**: every file the build reads from the working folder (`deck.html`, `narration.md`, `macros.tex`, `timeline.json`, data, figures, images, styles, deck-local components and themes), `voice.json` with local paths reduced to voice names, and the audio listed in `audio/manifest.json` for steps that exist in the narration (compressed to AAC as with `--embed-audio`; WAV with a warning if ffmpeg is missing). Each audio clip is stored once and the runtime plays it from there.
- **What stays out**: `comments.json`, hidden files and folders (`.cache/`, `.git/`, `.env`, …), `out/`, `video/`, `bundle/`, `node_modules/`, backups, `*.local.json`, credentials, unused audio and the TTS cache files. A file the build read but that is excluded is reported. Components and themes from this repository are referenced by name, version and SHA-256 instead of being copied (a theme from your theme folders, `EGATARI_THEMES` or `~/.egatari/themes`, is copied in as the deck's `themes/<name>/`); a registry name is a single identifier (`^[a-z][a-z0-9-]{0,63}$`), and the reader refuses a file whose registry names are anything else (a path, `..`, uppercase).
- **Lesson id**: the first export creates `egatari.json` in the working folder with a random `docId`; keep it with the deck so later exports keep the same id. Its optional `metadata` object may hold `license` (SPDX id or URL), `copyright`, `attribution`, `creators`, `description`, `accessibility`, `curriculum`, `completion`, `derivedFrom`, `authorship` and `audience`; `license`, `copyright` and `attribution` are also copied to the runtime metadata, so a play-only copy keeps them. Title and language come from `<title>` and `<html lang>`.
- **Narration without script**: the file also contains the display text of every step as ordinary HTML (hidden while the deck runs), for archiving, search and accessibility.
- **Extension lines** (`@x-<name>-<field> value`) are collected per step into the file's index.
- **Attachments** (format §3.8; draft, experimental, spec §3.8 draft): files for readers rather than for rendering, in `attachments/` (subfolders allowed): the original source (TeX, Word), the typeset PDF, code, data, supplements. Their roles, titles and descriptions are in `egatari.json`, in the same shape as the file's `index.attachments`: `"attachments": [{"path": "attachments/paper.pdf", "role": "pdf", "title": "Paper (PDF)", "description": "The journal version."}]`, `role` one of `source`, `pdf`, `code`, `data`, `supplement`, `title` required (a short name for the download list, one line of at most 120 characters, counted as Unicode code points as in the schema), `description` optional (one or two plain-text sentences, one line of at most 300 characters; shown under the title in the download list; other members are kept). Regular files under `attachments/` are packed (symbolic links are not followed; hidden files, backups and credentials stay out as above); only files with a valid role and a valid title are listed in `index.attachments`, the others are packed with a warning; an invalid description is dropped with a warning and the entry is still listed.
  - **Types per role** (spec §3.8, `kit/core/attach-content.mjs`): `pdf` takes PDF; `data` CSV, TSV, JSON, text and xlsx; `code` program source (`.py`, `.r`, `.jl`, `.c`, `.mjs`, `.ts`, `.sh`, …), notebooks (`.ipynb`) and environment definitions (`requirements.txt`, `pyproject.toml`, `uv.lock`, `environment.yml`, `Dockerfile`, …); `source` TeX, Markdown, text (e.g. BibTeX) and docx; `supplement` PNG, JPEG, WebP, PDF and text. Never attached: executables; in any role, the extensions that common operating systems run or open as scripts, exactly the spec's list (`.js`, `.jse`, `.vbs`, `.vbe`, `.wsf`, `.wsh`, `.hta`, `.bat`, `.cmd`, `.com`, `.scr`, `.ps1`, `.command`, `.app`, `.jar`, `.reg`, `.lnk`; attach JavaScript source as `.mjs`, `.cjs` or `.ts`); WebAssembly, macro-enabled or legacy Office (`.xlsm`, `.docm`, `.doc`, `.xls`, `.ppt`, RTF), HTML, SVG, another `.ega.html`, archives and containers (ZIP, TAR, 7z, …), audio and video, and any other type. The type comes from the extension and is checked against the content (magic bytes and structure), so a renamed executable, an HTML page named `.txt` or a file of two types (a PDF with a ZIP appended, an image with a PDF header) is refused. Each attachment's blob carries the media type of its type (`application/pdf`, `text/csv`, `text/plain` for source code, …).
  - **Content conditions**, checked without running anything and within bounds (at most 64 MiB decompressed is read; ZIP entries and declared sizes are limited, entries that overlap or decompress past their declared size are refused): PDFs without JavaScript, embedded files or XFA; automatic actions (`/OpenAction`, `/AA`) only a destination or a `GoTo` inside the document (as LaTeX's hyperref writes); link annotations only `GoTo` or `URI`; no other action (`Launch`, `SubmitForm`, `ImportData`, `GoToR`, `GoToE`, `Rendition`, `Named`, …), also inside compressed object streams; an encrypted PDF only if it opens with the empty user password (RC4, AES-128, AES-256; it is then decrypted and checked), otherwise refused. xlsx and docx (read as ZIP in memory, never extracted): no macros (`vbaProject.bin`, macro-enabled types), ActiveX, embedded objects, external links or other external relationships, data connections or web queries, DDE, functions that fetch external data (`WEBSERVICE`, `RTD`, `IMAGE`, `STOCKHISTORY`, `CALL`, …), field codes that run or fetch (`DDEAUTO`, `INCLUDETEXT`, `INCLUDEPICTURE`, `LINK`, …, or a field name built from a nested field) and remote templates. Text must be text (no NUL bytes except UTF-16 with a BOM); JSON and notebooks must parse.
  - **What happens**: the build (`--portable`) leaves out an attachment of a type that must not be attached or that fails a condition, with a warning naming the rule; values in CSV, TSV or xlsx that a spreadsheet may read as formulas (starting with `=`, `+`, `-`, `@` or a tab; numbers excepted) and text that looks like a credential or a machine-specific path are packed with a warning. The quality checker reports what the spec forbids (MUST NOT: forbidden types, a type the role does not take, audio and video, JavaScript in a PDF, macros, files of two types) as errors and the rest (SHOULD: the other conditions, content that does not match or cannot be checked; formula injection, credentials) as warnings.
  - Limits: 10 MiB per file, 20 MiB together, 100 files (base64 makes the single file about 4/3 of that); files over a limit are left out with a warning (`ATTACH_LIMITS` in `kit/core/attachments.mjs`). Attachments are not code (they do not make the file Extended), are not added to `requires` (a reader may ignore them) and are read within the build's byte budget.
  - **`egatari.json` in the single file** lists exactly `index.attachments` (spec §3.3): entries that are not listed for readers are left out of the copy in the file, with a warning; the working folder's `egatari.json` is not changed. Unpacking writes `index.attachments` into `egatari.json` (also for a file that has none), and packing a folder takes the list from `egatari.json`, so unpack → pack keeps the records. A file whose `egatari.json` lists other attachments than its index is refused (`attachments-mismatch`).
  - The player of a single file lists the attachments under **?** (title, description, file name, role, size) and with a paperclip button in the control bar, **download only**: it offers only entries with a valid title, whose extension the role takes and whose blob has the matching media type (an `.html` file, a `.js` file or a CSV listed as `pdf` is not offered even if the index lists it), saves each under the file name of its path (a name the operating system would not accept is not offered rather than renamed), notes on code attachments “Run code only if you trust its source”, checks the index hash and each attachment's size and SHA-256, checks the first bytes against the type (a `.txt` that starts as HTML is not saved), and saves the bytes as `application/octet-stream` through a download link, so nothing is opened or run, in the page or in a new tab. Play-only copies (`--play-only`) and the normal build carry no attachments (the format removes the archive layer). The quality checker also warns about missing roles or titles, unknown roles, listed files that do not exist, names that are not allowed (outside `attachments/`, `..`, reserved names, case collisions, hidden files, links) and files over the limits
- **Audio records**: each step's audio keeps the hash of the narration it was made from. When the TTS cache shows that the narration changed after the audio was made, that hash is written as `null` (unknown, so the step counts as stale); unpacking and packing keep the `null`. The runtime's audio entries also carry the audio media type, so a player does not need to guess it.
- Warns above 30 MiB (split long lessons into chapters).

| Option | Meaning |
|---|---|
| `--portable` | write the single file (default `out/<name>.ega.html`; `-o` sets the path) |
| `--play-only` | write a play-only copy (default `out/<name>.play.ega.html`): no source, only the runtime and its audio. Use it for learners when the source or extension data should not be handed out |

`npm run portable -- unpack <file> <dir> [--force]` extracts the source and audio into `<dir>` (and writes `audio/manifest.json` from the audio records, so the folder builds and packs again). It reads the file as text and never runs its scripts; it checks the index and every hash, the size limits and the path rules of the spec, refuses to write outside `<dir>` or through symbolic links, and refuses a non-empty `<dir>` unless `--force`. `npm run portable -- pack <dir> [-o file] [--play-only]` is `build --portable` on that folder: packing an unpacked folder gives the same file again.

Reading a single file (unpack and the [editor app](editor.md#single-files-no-folder)) also refuses an `audio/manifest.json` inside the archive (it is always made from the audio records) and a settings file whose `docId` differs from the index, and recomputes the source hash from the files: when it differs from the index or from the runtime metadata, the reader warns that the compiled lesson and its source disagree. A file of a newer major version, or one that requires a feature the reader does not implement, can only have its source extracted (`readPortable(text, {extract: true})` and the editor's Export folder…), and only when the index and the blobs check out with the 1.x rules; it is never edited or re-exported.

#### Editing without rebuilding (tier A)

`kit/core/tier-a.mjs` (`tierA(original, files, {identity?, fonts?})`, no Node or browser dependency, runs nothing) saves an edit of narration, audio or timing overrides into a single file without rebuilding it, as the format's tier A (§7.2). `files` is the edited working folder (the unpacked shape, with `audio/manifest.json`). It rewrites only: the changed entries of `deck-narration`, `deck-marks`, `deck-timing` and `deck-audio` (other entries keep their bytes, also their formatting); the changed `<div data-step-key>` of the readable layer; `sourceSha256` in `deck-meta` (and `docId` with `identity`); the changed members of the index (`files`, `blobs`, changed audio records, `requires`, `sourceSha256`, the entries of extensions made from the extension lines that changed, and `docId` / `metadata.derivedFrom` with `identity`) and its `data-sha256`; the blob blocks (new content appended, unreferenced blobs dropped); and, only when the changed narration needs characters that the file's `@font-face` rules do not cover, a new `<style id="…font-supplement-<n>">` with the `@fontsource` split files that cover them (`fonts`: `{faces(key), load(file)}`): `<n>` is one greater than the largest existing supplement number (from 0), the element follows the last style element with `@font-face` rules, and it has one `@font-face` per embedded face (family, weight, style) that lacks the characters (a file that embeds only weight 400 gets only 400; a family the file does not embed gets none, with a warning). Every other byte stays. Unknown members are kept at every level. Audio records of steps whose narration changed are kept as they are (their `inputHash` no longer matches, so they are stale); when a step's narration is removed altogether, its audio record and blob are removed too, with a warning. Narration for a key that matches no slide is left out of the readable layer, with a warning. It returns `{ok: true, html, index, deckMeta, changes, warnings}` or `{ok: false, code, reason}` when the edit needs a rebuild (`source-changed`: a file other than `narration.md`, `timeline.json` or the settings file changed), when the compiled lesson and the source disagree (`source-mismatch`), when `timeline.json` is not a JSON object (`timeline`), or when a region cannot be located (`layout`). Packing the unpacked result gives the same source files, audio records, runtime JSON blocks, readable layer and index; it differs in the fonts (a rebuild selects them again into `deck-base` and adds no supplement) and may order the blob blocks differently. `tools/test-tier-a.mjs` tests this with a region-aware diff (`tools/tier-a-diff.mjs`).

Attachments are archive entries, so adding, removing or renaming files under `attachments/` and changing their roles and titles in `egatari.json` are tier A edits too: only the index (`files`, `blobs`, `sourceSha256`, `attachments`), the chunks and `deck-meta.sourceSha256` change. It refuses (`source-changed`) when the slide source mentions the changed attachment's path (the build may have read it) and (`attachments`) when an added, changed or re-roled attachment breaks the limits, the name rules or the §3.8 types and conditions above; an attachment that was already in the file and did not change is kept as it is, with a warning if it does not meet them. When `egatari.json` lists attachments that are not in `index.attachments` (no role or title), the saved copy lists exactly `index.attachments`, and the result carries that text as `config` so that the editor writes it to its workspace too.

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
| `--replace-recorded` | also replace recorded and imported audio (manifest `kind` `recorded` / `imported`, written by the editor app's Audio panel) with TTS; without it they are kept |

| `voice.json` field | Meaning |
|---|---|
| `expert`, `novice` | a name (`<ref dir>/<name>.wav`) or a path (contains `/` or ends in `.wav`; relative to the deck). Defaults `bob`, `alice` |
| `lang` | language (default: `lang` of the deck's HTML — the file you pass, `<deckdir>/deck.html`, or the only `*.html` in the folder — else `ja`) |
| `engine` | `irodori` (default for Japanese) or `voxcpm2` (default otherwise) |

Writes `audio/seg_<digest>.wav`, `audio/seg_<digest>.json` and `audio/manifest.json` (steps removed from the narration are dropped from the manifest; their wav files stay). Each manifest entry also carries `kind: "tts"` and `inputHash`, the hash of the step's narration (format spec §5.4), so the editor app and the quality checker can tell when the narration changed afterwards. Recorded and imported takes are kept (see `--replace-recorded`). The editor app can also record, import or regenerate one step at a time in the browser ([editor](editor.md#narration-audio-audio-panel)); its post-processing uses the same numbers as `tts/core.py`. Warns if dry-run audio remains. When the server is not localhost, voice paths are not checked locally. Rebuild afterwards.

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
| `--captions` | burn the narration captions into the video (`?captions=1`); part of the cache key |

Outputs: `clip_NNNN.mp4`, `clip_NNNN.png`, `timeline.out.json` (`source, fps, scale, width, height, duration, clipDuration, segments[]` with `index, clip, still, key, slideKey, stepKey, i, k, title, chapter, start, dur, anim, lead, audioDur, audioOffset, frames, clipDur, clipStart, start_ms, end_ms, transcript, text`), `.render-cache.json`. Clips beyond the current number of steps are deleted.

## Tools

| Command | Purpose |
|---|---|
| `npm run new -- <folder> [--lang en\|ja] [--theme name] [--title "…"]` | new working folder (`deck.html` + `narration.md`) from a clean template; refuses a non-empty folder |
| `npm run ids -- <working folder \| deck.html> [--dry-run]` | give every slide without an id a new id (`s-` + 6 random base32 characters), rewrite `narration.md` headings to `## heading {#id}`, rename the keys in `audio/manifest.json`, `timeline.json`, `comments.json` and `data-morph="…"`; audio is not re-synthesized. Backups go to `.cache/edits/`, line endings are kept, a second run changes nothing. Refuses a deck with duplicate keys, id collisions or invalid ids |
| `npm run portable -- unpack <file> <dir> [--force]`, `npm run portable -- pack <dir> [-o file] [--play-only]` | single file ↔ folder; see [Single file](#single-file---portable) |
| `npm run build:app` | build the editor app: the hosted editor in `dist/` (for GitHub Pages; `dist/index.html`) and the single file `dist/editor.html`. See [editor.md](editor.md) |
| `node tools/test-app.mjs` | tests the editor app (OPFS folder, edit, narration, comments, external changes, export, presenter) |
| `node tools/get-fonts.mjs` | download the BIZ UDPGothic and BIZ UDPMincho TTFs into `fonts/` (enables glyph subsetting with uv) |
| `node tools/test-kokugo-example.mjs` | the kanbun of `examples/kokugo-kanbun` reads without warnings with the library's `m-kanbun` (no browser; the components' own tests are in egatari/components) |
| `node tools/test-layout-tate.mjs [workdir]` | `layout-tate` slides in the `default` and `kokugo` themes: heading column, body, conclusion column and page number placed without overlap, seek determinism, quality-check standards, slide keys and readable layer unchanged |
| `node tools/pdf.mjs <built.html> <out.pdf>` | PDF, one page per slide |
| `node tools/shot.mjs <built.html> <out.png> [i] [k] [mode]` | PNG of slide i (0-based), step k, final state |
| `npm run comment-shots -- <working folder \| deck.html> [id …] [--all]` | for each open comment in `comments.json` (or the listed ids, or all with `--all`), PNGs of its step's final state with its pin drawn: `<deck>/.cache/comment-shots/<id>.png` (480×300 of the slide around the pin at 2×, the whole slide without a pin), `<id>-full.png` and `index.json`. A comment whose step is gone is reported, not shot |
| `node tools/catalog.mjs` | regenerate `vendor/components/CATALOG.md` |
| `npm run components:update -- vX.Y.Z [--from <folder>]` | bring in a release of egatari/components into `vendor/components/` and `components.lock.json` (checks sha256 against `manifest.json`; never replaces a version) |
| `npm run components:check` | `vendor/components` matches `components.lock.json` (no network) |
| `node tools/narration-json.mjs <narration.md> [--voice json]` | parsed narration as JSON (used by `synth.py`) |
| `node tools/smoke.mjs <built.html> <outdir>` | timeline and a few screenshots |
| `node tools/test-components.mjs [name …] [--shots dir]` | build and test component demos |
| `node tools/test-tools.mjs <built.html> [outdir]` | overview, pens, laser, print, presenter ink |
| `node tools/test-controls.mjs <built.html> [outdir]` | control bar, help, presenter buttons |
| `node tools/test-autoplay.mjs <built.html>` | autoplay and its presenter-view button |
| `node tools/test-links.mjs [dir]` | links to slides: fragments at load, clicks in each mode, Back (button, keys, browser history), autoplay kept, embedding (`position` with `cause: "link"`, `linkRefused`), presenter view, `m-menu`, quality checker errors |
| `node tools/test-dev-server.mjs [workdir]` | dev server on a copy of `examples/minimal` |
| `node tools/flake.mjs <built.html> <i> <k> <outdir>` | investigate a false "depends on call order" report |

## Environment variables

| Variable | Used by | Meaning | Default |
|---|---|---|---|
| `CHROME_PATH` | check, pdf, shot, render, tests | browser executable | Google Chrome, then Microsoft Edge, then Playwright's Chromium |
| `IRODORI_URL` | TTS | OpenAI-compatible speech server | `http://localhost:8882` |
| `IRODORI_REF_DIR` | TTS | reference voice folder (`--ref-dir` wins) | `tts/voices/` |
| `MOTION_YOMI` | TTS | reading dictionary (`--yomi` wins) | `tts/yomi.yaml` |
| `EGATARI_THEMES` | build, check, dev server, portable | your theme folders, searched after the working folder and before the bundled `themes/` ([Themes](#themes)); separated by `:` (`;` on Windows) | none; `~/.egatari/themes` is searched after them when it exists |
