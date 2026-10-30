---
name: make
description: Make HTML lessons, animated slides, steps, parts and scripts for Egatari Studio, starting from an outline. Use for “make animated slides”, “make this into Egatari” or “make a lesson”. Former name motion-slides is retained for one version.
---

<!-- generated; do not edit by hand -->

Always reply in the language the user writes in. Write slides and narration in the lesson's language.

# egatari:make: Make a lesson

Egatari is an open lesson format ([specification](https://github.com/egatari/egatari-spec)). Egatari Studio is its editor: <https://studio.egatari.org/>.

**Instruction version: ecca7b6f**

If this differs from the version of the instructions copied in Studio, tell the user “new parts are available”.
In Claude Code, use `/plugin update egatari@egatari`.
In chat, download the make skill again from Studio and reinstall it.

## Workflow

First confirm the materials, audience, length, language and theme, and show an outline. Each item has a heading, what to convey, a recommended part and why, a conclusion line and materials. Never invent numbers. Write after the user approves the outline and parts. Use one speaker by default; write a dialogue only when asked.

Follow the shared writing rules below. When finished, use “When you finish” to deliver files or code blocks, according to your capabilities. For a fix request, fix the findings and return the result.

## Choose parts

Read only the standard and specialized sets you need. Extra parts have README pointers only. Size caps and free/paid filtering apply only to pasted instruction packs, not to this skill.

- [common](references/parts/en/common.md)
- [academic](references/parts/en/academic.md)
- [business](references/parts/en/business.md)
- [kokugo](references/parts/en/kokugo.md)
- [english](references/parts/en/english.md)
- [info](references/parts/en/info.md)
- [social](references/parts/en/social.md)
- [music](references/parts/en/music.md)
- [extra](references/parts/en/extra.md)

## Book (article pane) and layout

The book's body is text to read; the script is what is spoken at each step. Do not force the body into the script (R-article). Layouts are slides, flow (continuous reading), pages and split (slides and body). This version of Studio supports creating slides. The article pane and other layouts cannot be created yet. If needed, explain the limitation and review the body with the user as a separate draft. Do not promise that Studio can open unsupported output.

## Add audio

Ask the user to add audio in Studio's audio panel (make AI voice on this computer, record, or Google Colab). If egatari-studio is installed, follow its studio skill to add audio locally.

## When you finish

If you can write files, write `deck.html` and `narration.md` into a new folder. Deliver these files instead of the fenced blocks required by R-output below. If `egatari-studio:studio` is available, continue with that skill for quality checks, ids and building. Otherwise ask the user to open <https://studio.egatari.org/> in Chrome or Edge and select the folder using “Work in a folder…” (フォルダで作業する…) on the start screen or in the File menu. In Safari or Firefox, paste the contents of the two files into “New…” (新規作成…).

If you cannot write files, return the two fenced blocks `deck.html` and `narration.md` following R-output below, ready to paste into Studio's “New…”.

In both cases, do not write slide ids in a first draft (R-noids). Studio or the ids tool adds them later. Preserve existing ids when fixing a lesson.

# Instructions for the AI

Pack version: `ecca7b6f`

You will write one short **Egatari lesson**: an HTML slide deck with step-by-step reveals (`deck.html`) and a spoken script for it (`narration.md`). Both files are built and quality-checked automatically; anything not described here is not available. Write the lesson in the language the user asks for (slides and narration in the same language). Standards have ids such as **R-fit**; a fix request names the standards a draft broke. The user's request is in **What I want** at the end (or in the conversation before it): choose sensibly for any field that is empty or missing, and if both A and B are left, follow the one with content.

**Before you start (the most common failures):**

- **Both code blocks must be complete and closed.** Never stop in the middle of a block (R-output). Without an outline, keep the lesson short (5–8 slides). When the request gives an outline and a range of its slides, write exactly the slides of that range: the editor asks for at most 6 at a time, so they fit.
- **Sizes on the 1280×720 slide** (the quality checker measures them, R-fit): the body area is 1184 × 443 px (to 565 px; 1184 × 558 with `noconcl`). Body text is 32 px with 46 px per line, so about **8 lines** fit; every overflowing 46 px is one line to cut. **All text, also inside figures and components, is at least 24 px.**
- **Charts and figures:** components draw their labels at 24–28 px whatever their size (their SVG uses their own pixels), so size the component, not the text. A component of 380 px leaves room for one short line; with two lines, use 330 px.
- **Inline `<svg>`:** its text is scaled by displayed width ÷ viewBox width, so write the viewBox in the pixels it is shown at, e.g. `<svg viewBox="0 0 560 320" width="560" height="320">`, with `font-size` ≥ 24. Never combine `width:100%` with another viewBox width (a 600-wide viewBox shown 580 px wide turns 24 into 23.2 px). Prefer a component when one fits.

## 1. Output format

- **R-output** Reply with **exactly two fenced code blocks**, in this order, labelled `deck.html` and `narration.md` (the opening lines are ```` ```deck.html ```` and ```` ```narration.md ````). Put nothing between them; a one-line note before or after is fine. Never split a file over several blocks. Do not output files, a canvas or attachments: write both code blocks in the body of your chat message. Do not reference other files (no images, no `{{FIG:…}}`, no `{{JSON:…}}`, no external URLs, no `<link>`), and never stop in the middle of a block: if the deck would be too long, make fewer slides (but for a range of an outline, write exactly the requested slides).
- **R-outline** When the request asks for an **outline only** (a long lesson made in two passes), reply with exactly one fenced code block labelled `outline` (the opening line is ```` ```outline ````) and no `deck.html` or `narration.md`: a Markdown table with the columns `#`, heading and point (one line), one row per slide, every slide of the lesson in order. Each later request names a range (“slides 7–12 of the outline”): write exactly those slides, following their headings and points.
- **R-noids** Do **not** write slide ids. Write `<section class="slide">` without `id`, and narration headings without `{#…}`. The editor adds ids after import. When you are given a deck that already has ids (a fix request), keep every existing `id="…"` and `{#…}` exactly as it is.

## 2. deck.html

### 2.1 Skeleton

```html
<!DOCTYPE html>
<html lang="en" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lesson title</title>
</head>
<body>
<div id="stage">
  <section class="slide cover noconcl static"> … </section>
  <section class="slide"> … </section>
</div>
</body>
</html>
```

- `lang`: `en`, `ja`, … (the language of the lesson). `data-theme`: `sumi` for business and pitch decks, `kokugo` for Japanese language arts, otherwise `default`.
- No `<script>` except component data (§2.6), no `<link>`. A `<style>` block is allowed only for layout (sizes, gaps), never colors.

### 2.2 Slides

- Normal slide: `<h2>` heading, `<div class="body">…</div>`, then `<div class="concl"><span>…</span></div>` (the conclusion line: one short sentence).
- Cover: `<section class="slide cover noconcl static">` with optional `<div class="venue">…</div>`, `<h1>title</h1>`, optional `<div class="au">…</div>`.
- Chapter divider: `<section class="slide sec noconcl static"><h1>chapter title</h1></section>`.
- Classes on `<section>`: `noconcl` (no conclusion line), `static` (no steps), `nostep` (all list items visible from the start), `layout-tate` (Japanese vertical writing; only with the kokugo series pack, which describes it), and the `data-morph` attribute (§2.5).
- Inside `.body`: `<p class="sub">` sub-heading, `<div class="big">` main equation, `<p class="note">` note, `<div class="thm">` theorem box, `<div class="cols">` side-by-side columns, ordinary `<p>`, `<ul>`, `<ol>`, `<table>`.
- Inline emphasis (the only way to color text): `term` (term or question), `emph` (conclusion, problem, goal), `muted` (known result, de-emphasized), `b` (bold).
- **R-headings** Every slide heading (`h1` on the cover and dividers, `h2` elsewhere) is **different** from all the others (add a word if two would be the same), and the narration section of that slide starts with `## ` followed by **exactly the same heading text** (tags such as `<br>` dropped).
- **R-colors** Colors only through the theme: the classes above and the math macros `\hlE` `\hlT` `\hlM`; no hex, `rgb()`, named colors, `\color` or `\textcolor`. In a component or inline SVG: **Use only the theme's CSS variables for colors**: `var(--fg)` `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)`. In SVG write `style="stroke:var(--emph)"` rather than an attribute (`DECK.el` moves `fill` and `stroke` into style automatically when they contain `var(`)

### 2.3 Steps (reveal order = speaking order)

- **R-steps** Step 0 is the slide as it first appears: context only (heading, sub-heading, one framing sentence). An element with `data-step="k"` (k = 1, 2, …) appears at step k; material (list items, equations, table rows, figure parts) appears in the order you talk about it. An equation and the sentence that introduces it share one step (wrap both in `<div data-step="k">`). About 5 steps per slide at most.
- The conclusion line automatically becomes the **last step**, `concl`; never put `data-step` on it.
- If a slide has **no** `data-step` anywhere, its top-level list items (`.body > ul > li`, `.body > ol > li`) are numbered 1, 2, … automatically. As soon as any element has `data-step`, nothing is automatic: give every revealed element its `data-step`.
- A component adds its own steps (§3), starting at its `data-from` (default 1).
- So the steps of a slide are `0 … max` plus `concl` if it has a conclusion line. A `static` slide has only step 0.

### 2.4 Math (KaTeX, rendered at build time)

- **R-math** Inline `\( … \)`, display `\[ … \]`. Write `<` as `\lt` and `>` as `\gt` inside math. Allowed macros besides standard KaTeX: `\hlE{…}` (emph) `\hlT{…}` (term) `\hlM{…}` (muted), `\htmlId{ID}{…}`, `\htmlData{mark=ID}{…}`, `\htmlClass{…}{…}`, `\morph{ID}{…}`. No `\newcommand`, no `\color`. Define each symbol where it is first used (`\(\mu\)`: the mean).

### 2.5 Attention marks and morphs

- **R-marks** The narration’s `{mark:ID}` (§4) marks a target on the **same slide**. Targets: an element in the slide with `id="ID"` or `data-mark="ID"`. For part of an equation, KaTeX's `\htmlId{ID}{…}` / `\htmlData{mark=ID}{…}` (the build allows only these two and `\htmlClass`). If the same ID is used on several slides, use `data-mark` (ids must be unique in the document)
- Morph (optional): `<section class="slide" data-morph>` slides elements from the previous slide into place; pair elements with the same `data-id="…"` on both slides, or equation parts with `\morph{ID}{…}` on both. Only elements visible at step 0 move.

### 2.6 Components

- **R-components** Animated figures are the Web Components `<m-…>` of the catalog (§3), used inside `.body`. Give each a height (`style="height:380px"`) and an `aria-label`. Data goes in **one** child `<script type="application/json">…</script>` written inline (never `{{JSON:…}}`). **Numbers in figures must be correct** (compute them; never invent values for looks; label made-up business figures as fictional). Function formulas are arithmetic expressions only (`Math.exp(x)`, `x**2`); they are never run as code. Use components only where motion explains something; most slides need none.

### 2.7 Choosing a representation

- **R-purpose** Choose the representation from what the slide must say, not from habit. If the author names a chart type, use it. The table lists every part; use only those described in the text you were given (§3, and the packs included). If a part of another pack would fit better, say so in a one-line note.

Choose candidate parts from the set references.

- **R-whole** Lists, KPI cards and pies are shown whole; do not reveal them line by line unless the narration discusses each item in turn (for a list, give it one `data-step` or put `nostep` on the slide).

### 2.8 Fitting the slide (1280×720; the quality checker reports errors)

- **R-title** Heading: Japanese at most 26 units (full-width character = 1, ASCII = 0.5); English at most 60 characters. Never ends with a colon.
- **R-concl** Conclusion line: Japanese at most 35 units; English at most 70 characters. One line.
- **R-fit** The body must end above 565 px (680 px with `noconcl`): about 8 lines / 100 Japanese characters / 60 English words per slide, or one `big` equation and 3 short bullets, or a component of height ≤ 380 px and one short line (≤ 330 px with two). If it does not fit, split the slide; never shrink text and never set font sizes. Text in figures is at least 24 px.
- **R-style** Japanese slides: plain style (だ・である, 体言止め), no です・ます on slides, one punctuation style in the whole deck (`、。` or `，．`). English slides: short phrases, sentence case.

## 3. Component catalog

These components may be used in any lesson; a series pack, when it is included after §6, adds the components of its subject. Generated from the component READMEs (their notes are in Japanese). “steps” is how many slide steps a component uses (from `data-from`, default 1). Timing attributes (durations and delays in seconds) are not listed; their defaults fit the narration. Attribute values of type json are written as JSON in the attribute (`values="[0.1,0.5]"`).

Read only the parts you need from the set references above.

## 4. narration.md

```markdown
# Narration: <lesson title>

## The decay law
[0] Here is the decay law. We follow how many atoms are left.
[1] The number left is the starting number times a shrinking exponential.
[2] {mark:n0|circle}{N₀|N naught} is the number at the start, at time zero.
[concl] The half-life depends only on the decay constant.
```

- One section per slide, **in slide order, for every slide (cover included)**: `## <slide heading>` (R-headings), no `{#id}` (R-noids).
- **R-narr-steps** Step markers `[0]`, `[1]`, … and `[concl]`. **Every step of every slide has narration** (step 0 to max, and `[concl]` if the slide has a conclusion line), and there are **no markers for steps that do not exist** (a `static` cover has only `[0]`; a slide without a conclusion line has no `[concl]`; never `[01]`). Within a step, talk only about what appears at that step.
- **R-dialogue** **One narrator by default**: write no speaker names. Write a dialogue only when asked (if asked for three or more speakers, keep two roles and say so first): lines start with `Expert:` or `Novice:` (continuation lines indented; a line without a speaker is Expert), shaped as a cognitive apprenticeship:
  - Novice is never a mere backchannel: Novice voices the question a learner is likely to have, or paraphrases (“So …, is that right?”)
  - Expert answers and adds one example or analogy, or confirms (or corrects) the paraphrase and takes one step further
  - Only at a comprehension fork (where learners tend to misunderstand, or a “why” remains): at most one exchange per slide, 2–3 turns. Elsewhere Expert alone
  - Never a turn that is only “I see”, or that repeats the previous turn. Example: `Novice: So a larger rate always gets there faster?` `Expert: Not always. Too large, and each step jumps across the valley, like striding downhill onto the opposite slope.`
- `{cue}`: a sync point inside a step, one per entry of the component’s `cues(k)` (only where a component’s README asks for it; otherwise omit).
- `{mark:ID}`, `{mark:ID|effect}`, `{mark:ID|effect|hold=seconds}`, `{mark:clear}`: placed **right before** the words about the target; at most 1–2 per step; still say the thing in words. Effects: `underline` (default; a hand-drawn underline from left to right), `circle` (a hand-drawn circle), `box` (a rounded frame), `spot` (dims everything except the area around the target with the background color), `laser` (a dot of light slides to below the target and stays briefly)
- **R-reading** `{display|reading}` gives the reading of **one symbol or one term**: `{θ|theta}`, `{N₀|N naught}`, `{x̄|x bar}`, `{論語|ろんご}`. One symbol may carry a star, a prime, a subscript or superscript, or a hat/bar/tilde (`{Q*|Q star}`, `{x′|x prime}`, `{θ̂|theta hat}`). Write the display part in plain Unicode, not LaTeX, and never as an expression or several symbols (`{1-η|…}`, `{a*b|…}` and `{θとη|…}` are wrong: give each symbol its own reading and say the relation in words).
- **R-formula** **Never read an equation aloud**: no LaTeX, no `\`, `^`, `_`, and no strings such as `a + b = c` in the narration. Say what the equation means (“the number left is the starting number times a shrinking exponential”).
- Japanese narration is polite spoken Japanese (です・ます); English narration is plain spoken English. About 5 Japanese characters or 2.5 English words per second; 1–3 sentences per turn.

## 5. Fix requests

When the user pastes a **fix request** (a list of findings with the ids of the standards, followed by the current files), fix exactly those findings, keep everything else, keep every `id="…"` and `{#…}` unchanged (R-noids), and reply again with the two blocks (R-output). If the request contains only some slides, return only those `<section>` elements in the `deck.html` block (no `<html>`) and only their sections in the `narration.md` block; the editor puts them back in place by id.

## 6. Worked example

A small lesson, fictional, showing the structure only (do not copy its content). Note how the steps add up: the list of 2 items gives steps 1–2 and `[concl]`; the `m-flow` with 4 boxes gives steps 1–4. The static cover has `[0]` only. Each series pack ends with an example of its own.

### Common (English, default theme, marks, m-flow)

```deck.html
<!DOCTYPE html>
<html lang="en" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How a web page arrives</title>
</head>
<body>
<div id="stage">

<section class="slide cover noconcl static">
  <div class="venue">Computing basics, lesson 1 (a fictional course)</div>
  <h1>How a web page arrives</h1>
</section>

<section class="slide">
  <h2>Two programs take part</h2>
  <div class="body">
    <p>Opening a page is a conversation between two programs.</p>
    <ul>
      <li id="browser">The <span class="term">browser</span> asks for the page and draws it</li>
      <li id="server">The <span class="term">server</span> keeps the page and sends it back</li>
    </ul>
  </div>
  <div class="concl"><span>Every page load is a request and a reply</span></div>
</section>

<section class="slide">
  <h2>From the address to the screen</h2>
  <div class="body">
    <m-flow style="height:300px" aria-label="Four stages: type the address, send a request, send the page back, draw the page">
      <script type="application/json">{"nodes": [
        {"id": "a", "label": "Type the\naddress", "x": 10, "y": 100, "w": 250, "h": 110, "step": 1},
        {"id": "b", "label": "Send a\nrequest", "x": 315, "y": 100, "w": 250, "h": 110, "step": 2},
        {"id": "c", "label": "Send the\npage back", "x": 620, "y": 100, "w": 250, "h": 110, "step": 3, "tone": "term"},
        {"id": "d", "label": "Draw the\npage", "x": 925, "y": 100, "w": 250, "h": 110, "step": 4, "tone": "emph"}
      ], "edges": [
        {"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "d"}
      ]}</script>
    </m-flow>
  </div>
  <div class="concl"><span>A slow page is slow in one of these four stages</span></div>
</section>

</div>
</body>
</html>
```

```narration.md
# Narration: How a web page arrives

## How a web page arrives
[0] Today we follow a web page on its way from a server to your screen.

## Two programs take part
[0] Opening a page is a conversation between two programs.
[1] {mark:browser}The browser is the program you look at. It asks for the page and then draws it.
[2] {mark:server}The server is a program on another computer. It keeps the page and sends it back when asked.
[concl] Every page load is a request and a reply.

## From the address to the screen
[0] Let us put the steps in order.
[1] First you type the address of the page.
[2] The browser turns it into a request and sends it to the server.
[3] The server finds the page and sends it back.
[4] The browser draws the page on the screen.
[concl] When a page is slow, one of these four stages is taking the time.
```
