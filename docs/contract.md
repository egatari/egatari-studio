<!-- i18n: pair=contract.ja.md sha256=38f79a9597046d30 -->
# Contract (Studio notes on the authoring source)

English | [日本語](contract.ja.md)

**The normative text is the format specification, not this page.** The authoring source — slides, steps, kinds of slide, timing constants, math, references, slide identifiers, narration, readings, the component contract, emphasis marks and morphs — is defined in [§8 of the Egatari format specification](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#8-authoring-source-contract-version-1), with the timeline in §5.5 and links to slides in §9.1A; display modes, the preview of later steps and links that leave the lesson are in [Egatari Player 1.0](https://github.com/egatari/egatari-spec/blob/main/egatari-player-1.0.md) (P1, P4). This page keeps only what Egatari Studio adds: where its implementation lives, its run-time API, the dev server, the `✎` placeholders, the quality checker's codes and Studio's own CSS hooks. When the two disagree, the specification wins; change the specification first.

The one-line list of options, syntax and keys is in [reference.md](reference.md) ([日本語](reference.ja.md)). The section numbers below are kept so that references to them stay valid.

| Topic | Normative text |
|---|---|
| Position *(i, k, t)*, steps, kinds of slide, timing constants, math, references in the source | format §8.0 |
| Timeline (`dur`, `lead`, `pad_after`, `hold`, overrides) | format §5.5 |
| Slide identifiers and keys, step markers | format §8.1 |
| Narration (blocks, turns, `{cue}`, `{note:…}`, extension lines), readings | format §8.2, §8.3 |
| Components (`ctx`, steps, preview, variants, participant input, sounds, theme colours) | format §8.4 |
| Emphasis marks (`{mark}`) | format §8.5 |
| Morphs (`data-morph`) | format §8.6 |
| Display modes, preview of later steps | Player P1 |
| Links to slides; links that leave the lesson | format §9.1A; Player P4, P4.2 |
| Live | the `live` extension (format `extensions/live.md`) |

## 1. Position and time

- Studio's player draws the screen in one place, `DECK.seek(i, k, t)` (`t = Infinity` is the step's final state). A live talk passes real time; video export passes virtual time. **Parts must not use a wall clock, `setTimeout`, `requestAnimationFrame` or unseeded random numbers**
- While the slide is changing at step 0 (`seek(i, 0, t, from)`), the previous slide `from` is drawn underneath in its final state; a `data-morph` slide entered from its source morphs instead (§8)
- Whatever captures the screen (video export, the quality checker) waits for two `requestAnimationFrame`s after `seek` before capturing
- Theme colors are written with `oklch()` and `color-mix()`, so `getComputedStyle` may not return rgb. When you need numbers, paint the color on a canvas and read it back

## 2. Display modes

Modes and the preview of later steps are Player P1. In Studio's player: `?mode=talk|video` (default `talk`, or `<html data-mode>`); `learn` is not implemented yet. **Show later steps faintly** is the option `?preview=1` (key `l`), at the theme's `--preview-opacity`; elements with `data-preview="none"` and parts that declare `preview: "none"` stay hidden ahead (format §8.4).

## 3. Parts (Web Components)

The component contract is format §8.4. Studio's runtime API for writing one:

```js
DECK.define("m-sweep", class extends DECK.MotionElement {
  static steps = 2;                         // number of steps (the steps attribute overrides it)
  static props = {                          // the values it accepts (used to generate the component catalog)
    from: {type: "number", default: 0, doc: "start value"},
  };
  mount(ctx)       { /* once only. Create the SVG and elements */ }
  duration(k)      { return 1.2; }          // length of the motion of step k (seconds)
  cues(k)          { return null; }         // sync points within step k: one per {cue} in that step's narration (without the leading 0)
  render(k, t, ctx){ /* the state t seconds after step k began; t = Infinity is the final state */ }
});
```

- `ctx` is exactly what format §8.4 lists; rely on nothing else (Studio's player also passes `ctx.deck`, its internal object, which is not part of the interface)
- Interaction: the runtime marks a part touched when a `pointerdown`, `keydown`, `wheel`, `input` or `change` happens inside it, and on the next step entry (any `DECK.seek` or `DECK.go`, a link, the presenter's commands, printing) first draws it at another step (t = Infinity) and then at (k, t) with `ctx.reset = true`. Parts the viewer has not touched are drawn once
- **Use only the theme's CSS variables for colors**: `var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`. In SVG write `style="stroke:var(--emph)"` rather than an attribute (`DECK.el` moves `fill` and `stroke` into style automatically when they contain `var(`)
- Data: use only numbers output by scripts that have been checked. Put `<script type="application/json">{{JSON:file.json}}</script>` as a child of the part and read it as `this.data` (exactly one such direct child; with two or more, `this.data` is `null` and the slides are treated as having code of their own)
- Declare the data's shape in `static shape` (`kit/shape.js`: a small subset of JSON Schema, `{schema, example, note?}`; `{text: true, example}` for parts written as text, `{links: true, example}` for child `<a href>`; a json attribute may have `shape` in `static props`). The runtime checks it before counting steps: on a mismatch, or when `mount`/`render` throws, the part is not drawn, an inline placeholder (`.m-error`) says what is wrong, its steps are the `steps` attribute (else 0), and the problem goes to `DECK.componentErrors` (read by the quality checker, command and browser; never a stack trace). The part list in the instructions shows the shape and example
- Location: `components/<name>/{index.js, demo.html, README.md}`, with `name` `series` `summary` `steps` `props` at the top of the README (frontmatter). Library parts live in their own repository, [egatari/components](https://github.com/egatari/components) (proposals go to its issues); Studio carries copies of its releases in `vendor/components/<name>/<version>/` and pins the default version of each in `components.lock.json` (`npm run components:update -- vX.Y.Z` brings in a release; every version brought in is kept). A lesson's own parts go in `<deck>/components/<name>/` and are found first
- Versions: the build uses, for each library part, the version pinned for the lesson (when rebuilding an Egatari file, the version whose `index.js` matches the SHA-256 the file recorded; in a working folder, `components` in `egatari.json` (`{<name>: <version>}`, format spec §3.3), which an Egatari file's copy carries: the export writes the versions it used there, leaving the working folder's `egatari.json` as it is, and unpacking writes the recorded versions when the file has none), else the default in `components.lock.json`. A release the registry has withdrawn is listed under `yanked` in `components.lock.json` (`{<version>: {replacement, reason, date}}`, taken from the newest release's `manifest.json`; format spec §6): a lesson that pins or records one still builds with exactly that version, with the warning `yanked: m-<name> <version> …` (also from `kit/check.mjs`, and in the editor app a notice with a rebuild button); the replacement is never substituted silently. An Egatari file records `{name, version, sha256}` with the components release as `version` and, as `sha256`, the identity hash of `index.js`: line endings normalized first (CRLF and lone CR to LF, a leading UTF-8 BOM removed; format spec §6), so a checkout on any system gives the same hash. A file written before this rule on a Windows checkout (hash of CRLF bytes) still finds its version (`crlfSha256` in the lock). The motion primitives (marks §7, morphs §8) belong to Studio's runtime, not to parts

## 4. Script (narration.md)

The syntax is format §8.1–§8.3. Studio adds:

- `npm run new` gives every slide an id; `npm run ids -- <deck>` adds ids (and `{#id}` on the narration headings, and moves the keys in `audio/manifest.json`, `timeline.json` and `comments.json`) to a lesson that lacks them. Studio's build still keys a slide without an id by its heading so that such a lesson can be opened and fixed, and the quality checker reports it (`legacyIndex`, `linkNoId`); duplicate keys are an error, and the build gives later slides a suffix `#2`, `#3`, … so that it still builds
- An Egatari file never carries keys by heading: the export first gives every slide and script heading without an id one, and writes them back to the working folder (also the keys in `audio/manifest.json`, `timeline.json`, `comments.json` and `egatari.json`; backups in `.cache/edits/`)
- Stage directions `{note:…}` are removed by the shared parser before display, TTS and audio hashing. The presenter reads the archived script and shows them inline; captions, video and print omit them. The checker reports malformed notes as `narrNote` errors.
- The build writes each turn as `{role, text, ttsParts}` into `deck-narration` (`DECK.NARRATION`): `ttsParts` (`renderText` in `kit/core/narration-core.mjs`, the same value that enters `inputHash`) is never displayed and is left out of font subsetting; read-aloud (§5) speaks it
- A line starting with `✎ ` is a placeholder the editor put in a new slide (Studio convention, not part of the format). It is ordinary script text, so it is read aloud if left; the quality checker warns (`narrPlaceholder`, and `templateText` for template text left on the slide), and the editor shows the warning before TTS and export
- Do not read whole equations aloud (the quality checker warns). Extension lines are kept as they are by the dev server, the editor app and `npm run ids`

## 5. Timeline

The formula and constants are format §5.5 and §8.0. In Studio, `DECK.timeline()` computes them (autoplay and video export use the same function); write only the exceptions in `timeline.json` (`{"<slideKey>:2": {"pad_after": 1.0}}`).

- Audio with `startOffset` (seconds of encoder delay, e.g. 0.025057 for the editor app's MP3) is played from that media time, which counts as time 0 of `dur` and the cue times (autoplay and `render/render.mjs` alike)
- Every build writes the step's audio `kind` into its `deck-audio` entry (play-only derivatives drop the index, so the player relies on `deck-audio`). A manifest record without `kind` counts as `tts` when it has an `engine`; the silent `dry-run` engine gets no `kind`. The player reads `deck-audio`'s `kind` first and falls back to the index's audio records in older files (`DECK.audioKind(key)`). As format §7.3 asks, it says how the audio was made near the information and the playback controls, never on the stage or with the captions: when any step's audio is TTS, a small "AI voice" / 「AI 音声」 badge in the toolbar (tooltip and `aria-label` "The narration audio is AI-generated" / 「音声は AI で合成したものです」), the same sentence in the key list (<kbd>?</kbd>) and in the presenter view for those steps; `imported` audio gets "How the audio was made is not recorded" / 「音声の作り方は記録されていません」 there, with no badge (`DECK.aiVoice(key)`, `DECK.unknownVoice(key)`, `DECK.voiceNote(key)`, `DECK.VOICE_NOTE`). Recorded audio is not labelled
- **Read-aloud** (format §5.6) is not part of the timeline: “Listen with read-aloud (not saved as audio)” on a step without audio reads `ttsParts` with a voice of the device (`speechSynthesis`, `localService` voices only; “Pronunciations not applied (older file)” when a file has no `ttsParts`). It never changes `dur`, `DECK.timeline()`, `deck-audio` or the rendering, writes nothing, and does not exist in `?mode=video` or print (`kit/core/read-aloud.mjs`, `DECK.ReadAloud`)
- The end of the motion including the marks is `motion = max(anim, marksEnd)`; video export captures frames up to this point

## 6. (Removed)

The export for canon (a Marp-style lesson bundle) was removed in 0.4.2. The number is kept so that references to §7 and later stay valid.

## 7. Emphasis (`{mark}`)

The syntax, effects, targets and timing are format §8.5. In Studio (the first two items are quoted in the instructions for the AI):

- Effects: `underline` (default; a hand-drawn underline from left to right), `circle` (a hand-drawn circle), `box` (a rounded frame), `spot` (dims everything except the area around the target with the background color), `laser` (a dot of light slides to below the target and stays briefly)
- Targets: an element in the slide with `id="ID"` or `data-mark="ID"`. For part of an equation, KaTeX's `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}` (the build allows only these two and `\htmlClass`). If the same ID is used on several slides, use `data-mark` (ids must be unique in the document)
- Drawing: on an SVG overlaid on the slide (`svg.marks`, 1280×720), the shape is built from the outline of the target's text (the union of the glyph boxes); the hand-drawn wobble uses random numbers determined by the ID and the step. When the next `spot` or `laser` appears, it moves from the previous one
- The build puts `{"slideKey:stepKey": bounds}` (only for steps that contain `{mark}`) into `<script id="deck-marks">`; `DECK.MARKS`, and for the quality checker `DECK.marks(i, k)` (`[{id, effect, start, end, found}]`)
- Quality check: the build warns when a target is not in the source text (it cannot see elements created by parts); the quality checker looks for the targets on the actual screen, warns if they are missing, and lists the marks of each step as info

## 8. Morphs (`data-morph`)

The pairing and timing are format §8.6. In Studio:

- `\morph{ID}{…}` is a default macro of the build; it may be combined with an emphasis target, as in `\htmlId{eta}{\morph{eta}{…}}`. The source slide is drawn underneath in its final state; each paired element moves with translate + scale (transform-origin at the top left) from where the center of its text outline lies on the source, and colors are interpolated. Frames or backgrounds around paired elements (such as `.thm`) are swapped at the end; pairing elements with different text stretches them. Positions are remembered for each (from, i) and measured again when the window size or the text changes. `DECK.T.morph` = 0.9
- Quality check: warns when the source slide is missing, when there is no matching `data-id` at all, and about duplicate IDs, and lists the pairs as info (`DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`)

## 9. Links to slides

The grammar and behaviour are format §9.1A and Player P4 (an anchor `#<slide id>` or `#<slide id>:<stepKey>`; a purely numeric `#N` is the slide number). In Studio:

- **Back**: the small button at the top left (shown only after arriving by a link; it names the slide it returns to), Backspace (when no pen is active), Alt+← or the browser's back button. In a top-level window each link adds one history entry (`pushState`); in a frame the stack is kept in memory only. A fragment that matches no slide id is matched against slide keys (lessons without ids), and the quality checker warns about such links
- Embedded (`?embed=1`): the messages are Player P8. Studio's internal `deck-pos` message (presenter view, editor) also carries `cause` and `back`. In the presenter view, the presenter window follows the main window and forwards Backspace / Alt+←
- Run-time API: `DECK.resolveFragment(f)` → `{i, k, key, id}` or `{error}`, `DECK.fragment(i, k)`, `DECK.follow(f)`, `DECK.back()`, `DECK.links()` → `{depth, follow, back}`, `DECK.visited(i | key)` (used by `m-menu`)
- Quality check: a link to an unknown slide, to a step out of range, to `concl` on a slide without a conclusion, or to a slide number beyond the last is an **error**; `#N` links, links to slides without an id and relative links to files that do not exist are warnings

### Links that leave the lesson

The rule is Player P4.2. Studio implements it as a pure module, `kit/core/link-policy.mjs` (`LinkPolicy().decide(link, {base, hosts})`, no DOM, no `node:`), shared by the runtime (`DECK.LinkPolicy`), the tests and a future play page.

- The confirmation is `#deck-extlink` (`role="alertdialog"`, `aria-modal`): host and full address, **Open** in a new browsing context with `noopener,noreferrer`, focus on **Cancel**, Tab cycles inside, Esc or a click outside cancels and returns focus to the link, the lesson behind is `inert`. A plain `https:` link is asked once per host in a viewing session (memory only); a mismatched link text, a non-`https:` destination, `download`, a user name or password, or a punycode host are asked every time; other schemes are refused (a relative link from a lesson opened from `file:` to a neighbouring file is asked every time)
- Video mode and the presenter view's inner screens: nothing happens. Print: the box is hidden. The editor's preview and the dev server's frame (sandboxed, no popups): the box only tells where the link goes and has no **Open**
- Links the player makes itself (the Live's "Join in the browser", saving an attachment) skip the box: the player marks them with the JavaScript property `__egaOwn`, which no lesson markup can set (`tools/test-extlinks.mjs` checks it)
- Run-time API: `DECK.LinkPolicy()`, `DECK.extLink(href, text?, download?)`

## 10. Quality check: intended clipping

`data-clip` is an authoring rule, not an attribute of the file format; this section is its normative text. In Studio the name lives in one place (`CLIP_ATTR` in `kit/core/layout-scan.mjs`).

```html
<div class="code wall" data-clip>…a long XML listing, cut on purpose by the box…</div>
```

- The quality checker (command and browser, one implementation in `kit/core/layout-scan.mjs`) MUST warn about text that is cut off by a box with `overflow` other than `visible` (`textClipped`), SVG text cut off by its SVG viewport (viewBox) or going off the slide (`svgTextOut`), SVG text that overflows the `<rect>` drawn around it (`svgTextBox`), and text placed outside `.body` that goes off the slide or overlaps the heading, the conclusion line or the page number (`outsideBody`). On every slide it MUST also warn about text going off a slide that has no `.body` (`textOffSlide`), text boxes that overlap each other or the slide's decorative band (`textOverlap`), and a short word in a table cell that breaks across lines (`cellWordBreak`). All are warnings under R-fit
- `data-clip` on an element marks clipping there as intended: text in that element, including all its descendants and SVG text, MUST NOT be reported by those checks. It applies to both directions (horizontal and vertical). It MUST NOT change any other check (`bodyBottom`, `smallText`, …) nor the rendering
- On a slide whose body overflows at the bottom (`bodyBottom`), text inside `.body` that goes off the slide is not reported again (`svgTextOut` with the slide edge): cutting the body fixes both
- Boxes an ancestor hides are not measured: content inside a visually hidden (screen-reader only) container — a box of 2px or less with `overflow` other than `visible`, such as the 1×1 `.sr-only` pattern, or an ancestor whose `clip-path: inset(…)` or `clip: rect(…)` leaves nothing — MUST NOT be reported by any layout check (`bodyBottom`, `bodyRight`, `smallText`, `textOverlap`, …), whatever its class name. The body-position checks measure only the part of a box that its ancestors' `overflow` leaves visible; text cut off by a visible-size box is still `textClipped`
- Authors use `data-clip` only where the cut is part of the message (for example a "wall" of code faded out at the bottom), never to hide an overflow

`data-overlap="ok"` marks SVG text intentionally drawn in layers (`OVERLAP_ATTR` in `kit/core/layout-scan.mjs`).

```html
<text data-overlap="ok" x="100" y="100">…intentionally layered text…</text>
<g data-overlap="ok"><g><text x="100" y="100">…intentionally layered text…</text></g></g>
```

- The checker MUST compare visible SVG text with other SVG text, including text inside the same part, using only the ink boxes of non-whitespace glyphs (for upright text, the glyph's measured ink, not the font's full line height) with a 2 px overlap tolerance. Empty text, unpainted text (`fill` none or transparent on the `<text>` and no stroke), hidden text at the scanned step, and gaps between lines or separated spans MUST NOT count. The same text drawn twice at the same place (for example a copy of a card per destination before it moves) reads as one and MUST NOT count. Text already reported for leaving its box, the viewBox or the slide (`svgTextBox`, `svgTextOut`) MUST NOT be reported again as an overlap. This check does not compare text with lines or points
- An SVG `<text>` is excluded from `textOverlap` only when that `<text>` or any ancestor `<g>` carries exactly `data-overlap="ok"`. A bare attribute, an empty value, other values (including `OK`), or the marker on a `<tspan>`, `<svg>` or HTML element MUST NOT exempt text. It MUST NOT change clipping, overflow, minimum text size or rendering. Parts place the marker only on the intentionally layered text or its group, not on the whole part. `data-clip` also continues to exclude text from `textOverlap`
- `textOverlap` is an R-fit warning. For SVG text it names both texts on the slide and advises the author to move the item or change its coordinates, or add `shift` to the reverse edge in `m-flow`

`data-annot` is another authoring rule of this kind (in Studio, `ANNOT_ATTR` in `kit/core/layout-scan.mjs`): it marks a **small annotation** that is meant to be small.

```html
<span class="kb-num" data-annot>10</span>
```

- `data-annot` on an element marks text in it as an annotation set beside the text it explains (return marks, reading-order numbers of `m-kanbun`): the quality checker MUST NOT report that element's text, including all its descendants and SVG text, as too small (`smallText`, `smallSvgText`; the 24 px / 27 px minimum of R-fit). It MUST NOT change any other check (`textClipped`, `bodyBottom`, …) nor the rendering
- `data-annot` takes effect only on elements a part creates when it mounts, and has no effect in the author's source: the player removes every `data-annot` that is in the slides' own markup (including a hand-written child inside an `m-*` element) before parts mount, so small text cannot be exempted by marking it. A part sets it in `mount`
- Parts use `data-annot` only for a short mark (a number or a few characters) that points into the text, never for content: a sentence, a label of a figure or a table cell is not an annotation. Where the minimum can be met, meet it instead; the mark is a last resort

## 11. Live pane (extension `live`, draft)

Only a play-only copy exported with Live carries the Live player (`kit/live.js` with `kit/core/live-policy.mjs`, added by `kit/core/live.mjs`); every other output is unchanged. Its normative behaviour is in the format's [`live` extension](https://github.com/egatari/egatari-spec/blob/main/extensions/live.md) and the protocol in [egatari/live](https://github.com/egatari/live); this section is what Studio's runtime promises.

- The pane starts collapsed: only the marker `#live-mark` (a `<button>` with `aria-expanded`, top right) is shown and `#stage` keeps the full window, as `fit()` places it. The marker shows the connection state (`data-state`, a coloured dot and screen-reader text). The pane opens when the marker is pressed (it then stays open until closed) or by itself on a step that has a poll (not `*`), inside the live time, where the document can connect or offers **Join in the browser**; it collapses when that step is left unless the participant pinned it (**Keep open**). Opening is announced in a polite live region outside the pane; it does not move the focus
- The opened pane is outside the stage: `#live-pane` is docked at the right (at the bottom when the window is tall) and `#stage` is fitted into the rest with the same formula as `fit()`. It MUST NOT change what `DECK.seek(i, k, t)` draws, captions, marks or print; in video mode (`?mode=video`), the presenter view and its frames (`?presenter`, `?view`) it is not created at all, and print hides it (and the marker)
- It listens to `deck:pos` (`detail.key`) only to choose which polls to show and whether to open the pane; it never sends position or timing. It uses timers (reconnect, keep-alive, the live time's end), which is allowed because it draws nothing on the stage
- The endpoint MUST be `https:`. Only the development player, built by tests with `buildPortable(…, {liveDevLoopback: true})` (not a command-line option), accepts a loopback `http:` endpoint: the switch is a constant in `kit/core/live-policy.mjs` that only that build turns on, so the player in distributed lessons, the editor's export and `kit/build.mjs --live` refuse `http:`
- It connects only after Join, inside the live time (2 min leeway), in a top-level `file:`/`http(s):` document whose single CSP `<meta>` has `connect-src` equal to the endpoint; everything else (frames, `srcdoc`, sandboxed or preview documents) shows the Live's address as text
- Questions (draft): inside the live time, while the Live has a `qa` activity, a **?** button (`#live-ask .lv-q`, a `<button>` with an `aria-label`, at least 44 px) sits at the bottom right outside the pane. It opens the pane on the question box, or on Join before the participant has joined; it never connects by itself. A question carries the step key on screen when it is sent (`slideKey:stepKey`; the box says which slide and step in words), the lesson's `sourceSha256` (the exported block's `live.sourceSha256`, written by `kit/core/live.mjs` because a play-only `deck-meta` has none) and, optionally, a circled region: **Circle** (`aria-pressed`) turns on a drawing layer `#live-ink` over the stage (an SVG in stage coordinates, outside `#stage`; Esc ends it) whose strokes are normalised with `LivePolicy().normStrokes` (20 strokes, 500 points each, 2000 in all). A region belongs to its step: changing step clears it (announced)
- **I don't follow** (`#live-ask .lv-cf`, `aria-pressed`) appears next to **?** while joined when the Live has a `confused` activity for the step on screen; a tap marks that step, a second tap takes the mark back. The host's replies to the participant's own questions are listed in the pane under **Replies from the host** (also after a reload: the Live sends them again on join); a new reply is announced and, while the pane is collapsed, marked on `#live-mark`. Server text stays text. **?**, **I don't follow** and the drawing layer are hidden in print and not created in video mode or the presenter view

## 12. Themes and the layout CSS

A theme (`tokens.css`) is loaded after `kit/base.css` and `kit/layouts.css` (and before `kit/latin.css`), in every build path. It may therefore override layout rules as well as tokens: the cover, section dividers, heading, `.body` inset, conclusion line, page number, list markers and progress bar. It does not need an `html` prefix or other specificity tricks.

- The color tokens keep the meaning format §8.4 gives them whatever the theme changes; parts use only those variables, and the quality checker's color rules (contrast against `--bg`) apply to every theme
- A theme that moves layout boxes is still subject to the quality checker. It declares where the boxes are with `metrics` in `theme.json` (`"v": 1`), in stage pixels of 1280×720: `body.left`, `body.right`, `body.top`, `body.floor`, `body.line`, `concl.top`, `concl.height`, `tate.rule`, `tate.conclRight`, `tate.left`, `tate.floor` (meanings and defaults in the [reference](reference.md#themes)). A field it does not write comes from its `extends` parent, field by field, and without a parent from the defaults (today's `kit/layouts.css`), so a theme without `metrics` is checked exactly as before ([format spec](https://github.com/egatari/egatari-spec) §6)
- The quality checker derives the body limits (`bodyBottom`, `bodyRight`, `tateBodyHead`, `bodyConclCol`, `bodyLeft`) from these values. `metrics` moves where the limits are, never the limits themselves: the margins (6px above the conclusion line, 4px at the sides), the minimum text sizes (R-fit) and the title and conclusion lengths (R-title, R-concl) do not change with `metrics`
- A bundled theme (`themes/`) or a theme of the official theme library that moves the body, the conclusion line or the vertical columns from the defaults must declare `metrics`, and `tools/test-theme-metrics.mjs` fails when what its CSS renders differs from the declaration by more than 1px. For other themes (your own) the declaration is recommended: the quality checker (`npm run check` and the editor's quality check) warns `themeMetricsDrift`, once per lesson, when the rendered boxes differ from the declaration by more than 1px, or when a theme without `metrics` moves them; the warning names each field, the declared and rendered values, and whether the theme's CSS or the slides' own `<style>` moved the box. The boxes are measured only with the bundled fonts loaded (after `document.fonts.ready`, when the faces of the heading and page number report loaded), never with a fallback font: otherwise the checker skips the comparison and warns `metricsFontLoad` once per lesson. `node tools/theme-metrics.mjs measure <theme>` prints the block measured from the rendered theme, in whole pixels rounded outward to the more lenient limit (by less than 1px, so the rounding alone never makes drift)
- The slides do not have `metrics` and cannot change them: a `<style>` in the slides that moves a box gets `themeMetricsDrift`, and the limits stay the theme's. A value that is not a number, out of range or inconsistent with the others is a build warning (`theme-metrics: …`; the checker reports them once per lesson as `themeMetricsInvalid`), and the field (or, for inconsistent values, that theme's whole block) uses the parent's value
- `metrics` is for checks and authoring tools only. The player never uses it to draw (only CSS draws), and it is part of the theme's identity: `theme.json` counts toward the theme's `sha256` like any other theme file
- The bundled themes set tokens only, so the order does not change how they render

## 13. Review notes: the ink stroke

Review notes are the entries of `comments.json` in the working folder ([format spec](https://github.com/egatari/egatari-spec) §3.3). They are never put into a distributed file: an Egatari file (.ega.html), play-only or not, leaves `comments.json` out. An entry is `{id, created, key, range, pin?, strokes?, quote, comment, status, resolved?}`; this section fixes the shape of the two places on the slide, so that another reader (a future review mode of Egatari Live that imports notes into the working folder) can use the same shape.

- Coordinates: slide coordinates, 1280×720, origin at the top left of the slide, independent of the zoom and the window. A point names the final state of the step `key` (`DECK.seek(i, k, Infinity)`)
- `pin` (optional): `{x, y}`, numbers with 0 ≤ x ≤ 1280 and 0 ≤ y ≤ 720, rounded to 0.1. An Alt+click note's pin is the clicked point; a marker comment's pin is the centroid of all its strokes
- `strokes` (optional, only with `pin`): the marks drawn with the marker (`m` in edit mode), as a list of polylines `[[[x, y], …], …]`:
  - one or more strokes per note (a circle and an arrow, several underlines): at most 20 strokes, at most 500 points each and at most 2000 points in all
  - each stroke has at least 2 points, each a pair of numbers clamped to the slide and rounded to 0.1, no two consecutive points equal; nothing else in a point (no pressure, no time); a reader draws each stroke as its own open polyline
  - centroid (the marker's `pin`): over all strokes, the mean of the segment midpoints weighted by segment length, Σ ℓᵢ·mᵢ / Σ ℓᵢ (the first point of the first stroke if the length is 0). The note's `key`, `range` and `quote` come from the element under this centroid
- Normalizing (`normStrokes` in `kit/core/comment-core.mjs`, the one rule for both writers, the dev server and the editor app; the writers set `pin` to the centroid of the normalized strokes): a value that is not an array, has more than 200 strokes or more than 20000 points in all gives no strokes (the note is kept without them); per stroke, a value that is not an array, has more than 5000 points or fewer than 2 valid distinct points is dropped, invalid points are dropped and the rest clamped, rounded and de-duplicated, and above 500 points it is simplified with Ramer–Douglas–Peucker, keeping both ends, with a tolerance that starts at 0.25 and doubles until at most 500 points remain; the first 20 strokes are kept, and while they have more than 2000 points in all, every stroke is simplified again with one tolerance that starts at 0.25 and doubles; no stroke left gives no strokes
- Older entries: entries without `pin` or `strokes` stay valid. An entry written before multi-stroke notes has `stroke`, a single polyline `[[x, y], …]`; readers MUST read it as `strokes: [stroke]` (`entryStrokes`; `strokes` wins when both are present). Writers write only `strokes`. Readers MUST ignore strokes they cannot read and still show the note
- Display: the editor draws the strokes in its own overlay over the preview (`#dev-pins`), in the pin colour (red for listed notes, amber while the note is being written), never into the slides' DOM; `npm run comment-shots` draws all of them on both images and widens the crop to the bounding box of all strokes plus 48 px
