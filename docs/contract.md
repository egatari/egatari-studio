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
- Whatever captures the screen (video export, the checker) waits for two `requestAnimationFrame`s after `seek` before capturing (so that it never captures a screen before the drawing has been applied)
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
- **Use only the theme's CSS variables for colors**: `var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`. In SVG write `style="stroke:var(--emph)"` rather than an attribute (`DECK.el` moves `fill` and `stroke` into style automatically when they contain `var(`)
- Use only numeric data output by scripts that have been checked. Put `<script type="application/json">{{JSON:file.json}}</script>` as a child of the component and read it as `this.data` (exactly one such direct child; with two or more, `this.data` is `null` and the deck is treated as having code of its own)
- Location: `components/<name>/{index.js, demo.html, README.md}`. Write `name` `summary` `steps` `props` at the top of the README (frontmatter)

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
- Do not read whole equations aloud (the checker warns)
- Extension lines `@x-<name>-<field> <value>` (`<name>` without hyphens) inside a step carry extension data for that step. They are not part of any turn: never shown, never spoken, not in `bounds` nor in any hash, so editing them never makes audio stale. Editors (dev server, editor app, `npm run ids`) keep them as they are

**Slide keys** ([format spec](https://github.com/egatari/egatari-spec) §8.1). Every slide should have a stable id: `<section class="slide" id="s-k3f9q2">`. Ids match `^[A-Za-z][A-Za-z0-9_-]{0,63}$` and share the document's id namespace with attention-mark targets (`id="…"`, `\htmlId{…}`), so they must not equal any other id in `deck.html`. New ids are `s-` plus 6 random base32 characters (`[a-z2-7]`), never derived from the heading, so that renaming a heading changes nothing. `npm run new` gives every slide an id; `npm run ids -- <deck>` adds ids to an existing deck.

- In `deck.html` the slide key (`data-key`, added by the build) is the section's `id`; a slide without id (legacy) is keyed by the **normalized** text of its first heading: tags removed, `&nbsp;` read as a space, and **all** whitespace removed
- In `narration.md` a slide is addressed as `## <heading> {#<id>}` (recommended), `## <id>`, or `## <heading>` (legacy, only for slides without id). When `{#id}` is present it wins over the heading text; if the heading text differs from the slide's, the checker only reports it (info)
- A deck may mix slides with and without ids; each slide is keyed independently
- Two slides with the same key make the deck invalid (the checker reports an error); give one of them an id
- Step keys are `<slideKey>:<step>`, split at the **last** `:` (slide keys may contain `:`). Steps are written in canonical decimal, `0`–`999` without leading zeros, or `concl`; `[01]` and `[1000]` are not steps (build warns, the checker reports an error)

## 5. Timeline

The length of each step is decided by the runtime's `DECK.timeline()` (autoplay and video export use the same function).

```
dur = override.dur
   ?? max(anim, audio ? lead + audio + pad_after : hold)
```

- anim: the length of the step's motion (the maximum of the built-in effects and the components' `duration(k)`). Step 0 includes the slide transition (0.35 s), or 0.9 s for a morph from the previous slide (§8)
- audio: the TTS length (`audio/manifest.json`). Defaults: lead = 0.25 s, pad_after = 0.6 s, hold for a step without audio = 1.2 s
- Write only the exceptions in `timeline.json`: `{"更新の式:2": {"pad_after": 1.0}, "更新の式:concl": {"hold": 2}}`
- When both the component's `cues(k)` and the audio cue times (only the `{cue}` boundaries) exist and their counts match, the component's time is stretched piecewise linearly to follow the audio
- Attention marks (§7): in a step without audio, `max(hold, marksEnd + pad_after)` is used instead of `hold`. In a step with audio the marks fall within the audio, so dur does not change. `anim` does not include the marks. The end of the motion including the marks is `motion = max(anim, marksEnd)` (video export captures frames up to this point)

## 6. Output for canon

1 step = 1 frame (page) = 1 chapter. `clip_NNNN.mp4` (80 MB or less), `clip_NNNN.png` (final state), and a Marp-style md (each page has `# heading`, from the second step on `<!-- _paginate: hold -->`, and `Expert:` / `Novice:` lines in the narration comment).

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
- Embedding: the build puts `{"slideKey:stepKey": bounds}` (only for steps that contain `{mark}`) into `<script id="deck-marks">`. `DECK.MARKS`, and for checking `DECK.marks(i, k)` (`[{id, effect, start, end, found}]`)
- Checking: the build warns when a target is not in the source text (it cannot see elements created by components). check looks for the targets on the actual screen, warns if they are missing, and lists the marks of each step as info

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
- Checking: check warns when the source slide is missing, when there is no matching `data-id` at all, and about duplicate IDs, and lists the pairs as info. `DECK.morph(i)` = `{src, ids, later, dupSrc, dupDst}`
