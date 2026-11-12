# m-keyboard changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.4 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.3 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: key and step label widths use base's measured textWidth in the deck's font (Latin was 0.6 em). Black-key width (BW 0.58) is a key size and is unchanged.

## 2.0.2 (components 2.1.2)

- Fix: with cumulative, the label of an earlier step vanished when the next step began, so only the colour told the lit keys apart; each step's label now stays above the middle of its keys (underlined in its colour, the current one bold), on a second line when labels would overlap. Without cumulative nothing changes.
- Fix: a dur of 0 or less (for the whole keyboard or a step) was accepted silently and gave notes of no or negative length; it is now reported (data) and ignored (each note lasts until the next t, or 0.8 s).
- Fix: the element had no role, so assistive tech read every key name in the svg; it is now role="img" (the svg aria-hidden) named by the keys lit in the final state (「鍵盤：ド・ミ・ソ（Ⅰ）」; every step with cumulative), and an author aria-label is kept.

## 2.0.1 (components 2.1.0)

- Keys outside `range`: the error lists every such key and names a range that covers all keys in `steps`, with white
  keys at both ends and 12–36 semitones (e.g. `use C4-D5`). When the keys span more than 3 octaves, it says to split
  them over two keyboards. Behaviour is otherwise unchanged.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "keyboard", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-keyboard"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "keyboard"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/keyboard.html` (an English lesson:
  default `abc` names; `iroha`, `rise`, `cumulative`) at every step (tools/test-c2-identity.mjs).
- Steps never depend on the context (spec §8.4): the default key names (`solfa` for a Japanese lesson, else `abc`) are
  chosen in `mount` from `/^ja\b/i.test(ctx.lang)` (1.13.0: in `plan()`, from `DECK.ja`). `plan()` no longer carries
  `names`; the step count, durations and sound events never depended on them.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Reports: a step `tone` that is not a theme colour is `ctx.report("data", "[keyboard] …")`; an element too small for the
  keys, white keys too narrow for their names, overlapping black-key names and a step label wider than the element are
  `ctx.report("size", "[keyboard] …")` (1.13.0: `console.warn("m-keyboard: …")`). Range and key errors still throw
  (base contains them and reports `[keyboard] steps: …` / `mount: …`).
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- `static kb` (the keyboard geometry and names, read by tools/test-keyboard.mjs through `partClass`) is unchanged.
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
