<!-- i18n: pair=contract.ja.md sha256=d870d34ee9299102 -->
# Contract (runtime, components, narration, timeline)

English | [日本語](contract.ja.md)

Every part of this repository follows the rules in this document. When you change them, change this document first (and its Japanese version, [contract.ja.md](contract.ja.md)).
The list of options, syntax and keys is in [reference.md](reference.md) ([日本語](reference.ja.md)).

## 1. Position and time

The "position" during a talk is given by three values: (slide i, step k, seconds t since the step began).

- Step 0 is right after entering the slide. An element with `data-step="k"` appears at step k. The conclusion line (`.concl`) automatically becomes the last step
- **The screen is determined by (i, k, t) alone.** Components must not use a wall clock, `setTimeout`, `requestAnimationFrame`, or unseeded random numbers
- t = Infinity is the final state of that step (going back, jumping to a page, printing, the still part of a video)
- The runtime draws the screen in one place (`DECK.seek(i, k, t)`). A live talk passes real time; video export passes virtual time

- While the slide is changing at step 0 (`seek(i, 0, t, from)`), the previous slide `from` is drawn underneath in its final state. When a `data-morph` slide is entered from its source slide, a morph (§8) is used instead of the cross-fade
- Whatever captures the screen (video export, the quality checker) waits for two `requestAnimationFrame`s after `seek` before capturing (so that it never captures a screen before the drawing has been applied)
- Theme colors are written with `oklch()` and `color-mix()`, so the value from `getComputedStyle` may not be rgb. When you need numbers, paint the color on a canvas and read it back

## 2. Display modes

`?mode=talk|lecture|video` (default `talk`). `data-step` is shared; only the presentation changes.

| Mode | Elements of later steps | Elements of the current step |
|---|---|---|
| talk | hidden | appear (fade and move up) |
| lecture | shown faintly | highlighted (`.cur`) |
| video | same as talk; advances automatically along the timeline | |

## 3. Components (Web Components)

```js
DECK.define("m-sweep", class extends DECK.MotionElement {
  static steps = 2;                         // number of steps of the component (can be overridden with the steps attribute)
  static props = {                          // declaration of the values it accepts (used to generate the component catalog)
    from: {type: "number", default: 0, doc: "start value"},
  };
  mount(ctx)       { /* once only. Create the SVG and elements */ }
  duration(k)      { return 1.2; }          // length of the motion of step k (seconds)
  cues(k)          { return null; }         // sync points within step k (array of seconds). One per {cue} in the narration of that step (do not write the leading 0)
  render(k, t, ctx){ /* draw the state t seconds after step k began. t = Infinity means the final state */ }
});
```

- The component's steps start at the slide step `data-from` (default 1). When the slide is at step K, the component's step is `k = clamp(K - from + 1, 0, steps)`. Outside the component's range of steps it is called with t = Infinity
- `render` must give **the same screen for the same (k, t)**. Do not rely on state from the previous call (going back, jumping and video export change the order of calls)
- `ctx = {mode, slide, instant, deck}`. The component can choose, for example, to show the final state and highlight the current step when `ctx.mode === "lecture"`
- A component may open an overlay on a click (the conjugation card of `m-kobun`). This is a presenting control, like the pen, outside the (i, k, t) rule: it must close when the step changes, never open in `?mode=video`, not print, take nothing from the network, and show text only
- **Use only the theme's CSS variables for colors**: `var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`. In SVG write `style="stroke:var(--emph)"` rather than an attribute (`DECK.el` moves `fill` and `stroke` into style automatically when they contain `var(`)
- Use only numeric data output by scripts that have been checked. Put `<script type="application/json">{{JSON:file.json}}</script>` as a child of the component and read it as `this.data` (exactly one such direct child; with two or more, `this.data` is `null` and the deck is treated as having code of its own)
- Declare the data's shape in `static shape` (`kit/shape.js`: a small subset of JSON Schema, `{schema, example, note?}`; `{text: true, example}` for components written as text, `{links: true, example}` for child `<a href>`; a json attribute may have `shape` in `static props`). The runtime checks it before counting steps: on a mismatch, or when `mount`/`render` throws, the component is not drawn, an inline placeholder (`.m-error`) says what is wrong, its steps are the `steps` attribute (else 0), and the problem goes to `DECK.componentErrors` (read by the quality checker, command and browser; never a stack trace). The guide's component list shows the shape and example
- Location: `components/<name>/{index.js, demo.html, README.md}`, with `name` `series` `summary` `steps` `props` at the top of the README (frontmatter). Library components live in their own repository, [egatari/components](https://github.com/egatari/components) (proposals go to its issues); Studio carries copies of its releases in `vendor/components/<name>/<version>/` and pins the default version of each in `components.lock.json` (`npm run components:update -- vX.Y.Z` brings in a release; every version brought in is kept). A deck's own components go in `<deck>/components/<name>/` and are found first
- Versions: the build uses, for each library component, the version pinned for the deck (when rebuilding a single file, the version whose `index.js` matches the SHA-256 the file recorded; in a working folder, `components` in `egatari.json` (`{<name>: <version>}`, format spec §3.3), which a single file's copy carries: the export writes the versions it used there, leaving the working folder's `egatari.json` as it is, and unpacking writes the recorded versions when the file has none), else the default in `components.lock.json`. A single file records `{name, version, sha256}` with the components release as `version` and, as `sha256`, the identity hash of `index.js`: line endings normalized first (CRLF and lone CR to LF, a leading UTF-8 BOM removed; format spec §6), so a checkout on any system gives the same hash. A file written before this rule on a Windows checkout (hash of CRLF bytes) still finds its version (`crlfSha256` in the lock). The motion primitives (marks §7, morphs §8, the camera) belong to Studio's runtime, not to components

## 4. Narration (narration.md)

```markdown
## 更新の式 {#s-k3f9q2}           ← the slide heading, then the slide's id
[0] 更新の式です。今の点から、次の点を決めます。
[1] 次の点は、今の点から勾配に比例した分だけ引いて作ります。
[2] Expert: η は学習率で、1 歩の大きさを決めます。
    Novice: 大きすぎると、どうなりますか。
[concl] つまり、勾配の逆向きに、学習率に比例した幅だけ進みます。
```

- `[k]` is the step number, `[concl]` is the step of the conclusion line. A step can have several lines (changes of speaker)
- The only speakers are `Expert:` and `Novice:`. A line without a speaker is Expert (single-speaker mode)
- `{cue}` inserts a sync point within a step (matched in order with the component's `cues(k)`)
- `{mark:ID}` `{mark:ID|effect|hold=seconds}` `{mark:clear}` insert attention marks (§7). They are removed from the displayed text, and in TTS they act as boundaries, like `{cue}`
- The step's boundaries (`{cue}` and `{mark:…}`), listed in order across turns (`bounds`), correspond one to one with the TTS `cues` (the array of boundary times). Component time-stretching uses only the `{cue}` ones
- `{φ|ファイ}` is an inline reading (displayed as φ, read by TTS as "ファイ"). Other symbols are read with the reading dictionary
- Do not read whole equations aloud (the quality checker warns)
- Extension lines `@x-<name>-<field> <value>` (`<name>` without hyphens) inside a step carry extension data for that step. They are not part of any turn: never shown, never spoken, not in `bounds` nor in any hash, so editing them never makes audio stale. Editors (dev server, editor app, `npm run ids`) keep them as they are

**Slide keys** ([format spec](https://github.com/egatari/egatari-spec) §8.1). Every slide should have a stable id: `<section class="slide" id="s-k3f9q2">`. Ids match `^[A-Za-z][A-Za-z0-9_-]{0,63}$` and share the document's id namespace with attention-mark targets (`id="…"`, `\htmlId{…}`), so they must not equal any other id in `deck.html`. New ids are `s-` plus 6 random base32 characters (`[a-z2-7]`), never derived from the heading, so that renaming a heading changes nothing. `npm run new` gives every slide an id; `npm run ids -- <deck>` adds ids to an existing deck.

- In `deck.html` the slide key (`data-key`, added by the build) is the section's `id`; a slide without id (legacy) is keyed by the **normalized** text of its first heading: tags removed, `&nbsp;` read as a space, and **all** whitespace removed
- In `narration.md` a slide is addressed as `## <heading> {#<id>}` (recommended), `## <id>`, or `## <heading>` (legacy, only for slides without id). When `{#id}` is present it wins over the heading text; if the heading text differs from the slide's, the quality checker only reports a finding (info)
- A deck may mix slides with and without ids; each slide is keyed independently
- Two slides with the same key make the deck invalid (the quality checker reports an error); give one of them an id
- Step keys are `<slideKey>:<step>`, split at the **last** `:` (slide keys may contain `:`). Steps are written in canonical decimal, `0`–`999` without leading zeros, or `concl`; `[01]` and `[1000]` are not steps (build warns, the quality checker reports an error)

## 5. Timeline

The length of each step is decided by the runtime's `DECK.timeline()` (autoplay and video export use the same function).

```
dur = override.dur
   ?? max(anim, audio ? lead + audio + pad_after : hold)
```

- anim: the length of the step's motion (the maximum of the built-in effects and the components' `duration(k)`). Step 0 includes the slide transition (0.35 s), or 0.9 s for a morph from the previous slide (§8)
- audio: the TTS length (`audio/manifest.json`). Defaults: lead = 0.25 s, pad_after = 0.6 s, hold for a step without audio = 1.2 s
- Audio with `startOffset` (seconds of encoder delay, e.g. 0.025057 for the editor app's MP3; format spec §5.2) is played from that media time, which counts as time 0 of `dur` and the cue times (autoplay and `render/render.mjs` alike)
- Every build writes the step's audio `kind` (`tts`, `recorded` or `imported`, format spec §5.2) into its `deck-audio` entry: plain builds, dev and preview, single files and play-only derivatives (which drop the index, so the player relies on `deck-audio`). A manifest record without `kind` counts as `tts` when it has an `engine` (a `tts/synth.py` record); the silent `dry-run` engine gets no `kind`. The player reads `deck-audio`'s `kind` first and falls back to the index's audio records in older single files (checking the index hash where the browser can; `DECK.audioKind(key)`). As format spec §7.3 asks, the player says how the audio was made near the information and the playback controls, never on the stage or with the captions: when any step's audio is TTS, a small "AI voice" / 「AI 音声」 badge in the control bar (shown and hidden with the bar; its tooltip and `aria-label` are "The narration audio is AI-generated" / 「音声は AI で合成したものです」), the same sentence as a line in the key list (<kbd>?</kbd>), and as one line in the presenter view for those steps. `imported` audio gets "How the audio was made is not recorded" / 「音声の作り方は記録されていません」 in the key list and the presenter view, with no badge (`DECK.aiVoice(key)`, `DECK.unknownVoice(key)`, `DECK.voiceNote(key)`, `DECK.VOICE_NOTE`). Recorded audio is not labelled
- Write only the exceptions in `timeline.json`: `{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`
- When both the component's `cues(k)` and the audio cue times (only the `{cue}` boundaries) exist and their counts match, the component's time is stretched piecewise linearly to follow the audio
- Attention marks (§7): in a step without audio, `max(hold, marksEnd + pad_after)` is used instead of `hold`. In a step with audio the marks fall within the audio, so dur does not change. `anim` does not include the marks. The end of the motion including the marks is `motion = max(anim, marksEnd)` (video export captures frames up to this point)

## 6. (Removed)

The export for canon (a Marp-style lesson bundle) was removed in 0.4.2. The number is kept so that references to §7 and later stay valid. Video export (`render/render.mjs`) is unchanged: 1 step = 1 clip.

## 7. Attention marks (`{mark}`)

Marks part of a slide in time with the speaker's words. Marks are also determined by (i, k, t) alone (`seek` redraws them every time).

```markdown
[2] {mark:eta|circle}η は学習率です。{mark:grad}勾配は、損失が最も急に増える向きです。
```
```html
<div class="big" data-step="1">\[ \theta_{t+1}=\theta_t-\htmlId{eta}{\eta}\,\htmlId{grad}{\nabla f(\theta_t)} \]</div>
```

- Syntax: `{mark:ID}`, `{mark:ID|effect}`, `{mark:ID|effect|hold=seconds}`, `{mark:clear}` (at that point, clears all marks of the step)
- Effects: `underline` (default; a hand-drawn underline from left to right), `circle` (a hand-drawn circle), `box` (a rounded frame), `spot` (dims everything except the area around the target with the background color), `laser` (a dot of light slides to below the target and stays briefly)
- hold: seconds from appearing until it starts to disappear. The default is until the end of the step (1.5 s for `laser` only). It fades out over 0.3 s. There is only one `spot` and one `laser` at a time; when the next one appears, it moves from the position of the previous one
- Targets: an element in the slide with `id="ID"` or `data-mark="ID"`. For part of an equation, KaTeX's `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}` (the build allows only these two and `\htmlClass`). If the same ID is used on several slides, use `data-mark` (ids must be unique in the document)
- Timing: when there is audio and the boundary counts (`bounds` and `cues`) match, `cue + lead`. When there is no audio (a live talk, before TTS) or the counts do not match, every 0.9 s from the end of the step's motion (`anim`) (`{cue}` is not counted)
- Drawing: on an SVG overlaid on the slide (`svg.marks`, 1280×720 coordinates), the shape is built from the outline of the target's text (the union of the glyph boxes) and drawn over 0.5 s. Colors are `var(--emph)` and `var(--bg)`. The hand-drawn wobble is made with random numbers determined by the ID and the step
- t = Infinity is the final state of the step (marks that have disappeared through hold or clear are not shown). Lecture mode always shows the final state. When you move on to the next step, the marks of the previous step disappear (each step is independent)
- Marks are not printed (PDF)
- Embedding: the build puts `{"slideKey:stepKey": bounds}` (only for steps that contain `{mark}`) into `<script id="deck-marks">`. `DECK.MARKS`, and for the quality checker `DECK.marks(i, k)` (`[{id, effect, start, end, found}]`)
- Quality check: the build warns when a target is not in the source text (it cannot see elements created by components). The quality checker looks for the targets on the actual screen, warns if they are missing, and lists the marks of each step as info

## 8. Morphs (`data-morph`)

A transition in which the same elements as on the previous slide slide from their previous position to their current one (Keynote's Magic Move). It happens only on slides that ask for it.

```html
<section class="slide" data-morph>               <!-- from the previous slide. With data-morph="key", only when entered from that slide -->
  <p>\( \morph{th1}{\theta_{t+1}}=\morph{th0}{\theta_t}-\morph{eta}{\eta}\,\morph{g}{\nabla f(\theta_t)} \)</p>
  <ul><li data-id="gdef">\(\nabla f(\theta_t)\)：勾配</li></ul>
```

- Pairing: elements with the same `data-id` on the source and destination slides. For part of an equation, `\morph{ID}{…}` (= `\htmlData{id=ID}{…}`, a default macro of the build). It may be combined with an attention-mark target, as in `\htmlId{eta}{\morph{eta}{…}}`. IDs must be unique within a slide (the second and later ones are not used; when nested, only the outer one moves)
- When it happens: at `seek(i, 0, t, from)` entering step 0, when `from` is the source slide (by default i−1). Length `DECK.T.morph` = 0.9 s. It does not happen when going back or jumping (t = Infinity), when printing, or with `prefers-reduced-motion`. It does happen in lecture mode
- Drawing: the source slide is drawn underneath in its final state, and the destination slide's background is made transparent. Each paired destination element moves to its current place with translate + scale (transform-origin at the top left), starting from the position and size at which the center of its text outline lies on the center of the source text. If the colors differ, they are interpolated. The paired source elements are hidden. Unpaired parts of the source disappear during the first 45%, and unpaired parts of the destination (those visible at step 0) appear during the last 55%
- Destination elements not visible at step 0 (inside `data-step` > 0) do not move (they appear normally later)
- Positions are measured in stage coordinates (1280×720) from the source's final state and the destination's step-0 layout, and remembered for each (from, i). The screen is the same whatever the order of calls. They are measured again when the window size or the text changes
- Timeline: when `data-morph` has the previous slide as its source, `anim(i, 0)` is at least 0.9 s (autoplay and video export enter from i−1)
- Limits: elements inside an SVG are not supported. Frames or backgrounds surrounding paired elements (such as `.thm`) are swapped at the end of the transition. Pairing elements with different text stretches them to match sizes (use it for elements with the same text)
- Quality check: warns when the source slide is missing, when there is no matching `data-id` at all, and about duplicate IDs, and lists the pairs as info. `DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`

## 9. Links to slides

An ordinary anchor whose fragment is a slide id is a link to that slide ([format spec §9.1A](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#91a-links-to-slides)). It contains no script, so it may appear in a Core document.

```html
<a href="#s-njd4kp">春暁</a>            <!-- step 0 of the slide with id s-njd4kp -->
<a href="#s-njd4kp:2">読む順</a>        <!-- step 2; the step key is 0, 1, … or concl -->
<a href="lesson2.ega.html">次の課</a>    <!-- another file: an ordinary link -->
```

- Grammar: `#<slide id>` or `#<slide id>:<stepKey>`, split at the **last** `:`. The step key is canonical decimal (`0`, `1`, …, at most 999) or `concl`; the conclusion step is addressed only as `concl`. A fragment that matches no slide id is matched against slide keys (legacy decks without ids); the quality checker warns about such links. A purely numeric `#N` is the slide number (1-based), as before
- Start position: the same fragments in the file's URL select the position at load (final state of that step). An unreadable fragment opens slide 1 with a console warning; `#N` beyond the last slide opens the last one. While navigating, the address shows `#N` (unchanged)
- Following a link: in talk and lecture mode the player goes to that step in its final state (t = ∞) and stays paused; during autoplay it seeks there and keeps playing from the start of that step. In video mode links do nothing (the screen is a function of (i, k, t) only). With a pen or the laser active, a click draws and does not follow
- Back: the player keeps the positions before each link (a stack). **Back** returns to the position before the most recent link, keeping the playing state: the small button at the top left (shown only after arriving by a link; it names the slide it returns to), Backspace (when no pen is active), Alt+←, or the browser's back button. In a top-level window each link adds one history entry (`pushState`), so the browser's back and forward work too; forward returns to the last position reached after that link. Ordinary navigation (arrows, numbers, overview) adds no entries. In a frame the stack is kept in memory only
- Never top-level: links to slides never navigate the window; the click is handled inside the document (`preventDefault`). A link to another file is an ordinary navigation of the same frame; in sandboxed previews (the editor, the dev server) the sandbox may block it
- Keyboard: a focused link follows on Enter; when the link was activated from the keyboard, Back returns focus to it
- Embedded (`?embed=1`, in a frame): every step change posts `{egatari:"position", slideKey, stepKey, t, cause}` to the parent (`cause`: `link`, `seek`, `control` or `play`; `t` is `null` when the step is shown in its final state). A host that restricts navigation refuses links with `?links=0` or the command `{egatari:"links", id?, follow:false}` (answered with `{egatari:"links", id, follow}`; only messages from `window.parent` count). A refused link leaves the player where it is and posts `{egatari:"linkRefused", slideKey, stepKey}`, so the host may seek there itself. The internal `deck-pos` message (presenter view, editor) also carries `cause` and `back` (the title of the slide Back returns to, or `null`)
- Presenter view: the presenter window follows the main window (as for any navigation), shows its own Back button and forwards Backspace / Alt+←. A link clicked on the "current screen" iframe is followed by the main window
- Captions and the live region follow the new step like any other navigation
- Run-time API: `DECK.resolveFragment(f)` → `{i, k, key, id}` or `{error}`, `DECK.fragment(i, k)`, `DECK.follow(f)`, `DECK.back()`, `DECK.links()` → `{depth, follow, back}`, `DECK.visited(i | key)` (the slide has been shown in this session; used by `m-menu`)
- Quality check: the quality checker reports a link to an unknown slide, to a step out of range, to `concl` on a slide without a conclusion, or to a slide number beyond the last as **errors**; it warns about `#N` links, links to slides without an id, and relative links to files that do not exist
