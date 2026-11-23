# m-code changelog


## 2.2.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.2.0 (components 2.11.0)

- **Fit to the box.** When the 2.1.0 layout fits, nothing changes; tools/test-same-paint.mjs compares the pixels with the release before. When it does not fit, the part now draws a fit layout instead of cutting with … and reporting `layout`. The 2.1.0 cases are: code taller or wider than the box, a note too long for the band, or a step that lists 3 or more lines.
  - Notes go in the band, up to 2 rows each.
  - Long lines wrap after a space, comma or opening bracket. Continuation rows show "↪" in the number column.
  - When the rows don't fit the height, a moving window shows each step's lines, centred, with "⋮ n" for the rows hidden above or below. The window changes in the first half of the step (old rows fade out) and the second half (new rows fade in).
  - Up to 16 lines are still advised. Longer code is accepted and windowed.
- **`lines` with 3 or more integers** highlights exactly those lines, which need not be adjacent, e.g. `[2, 5, 9]`. `[3]` (one line) and `[3, 5]` (a range) are unchanged.
- **Final note list too long:** the band keeps the last note. This is no longer a `layout` report; the element gets `data-fit="last-note"` (the notes are all in the accessible label).
- The full source and output `<pre>` has `data-readable`, so the readable layer can copy it as visible text.
- The drawing helpers (monospace width, cut, the colour roles, prose wrap) moved verbatim to the library part `code-core` 1.0.0.

## 2.1.0 (components 2.7.0)

- Syntax colouring with theme roles only: keywords `--term`, strings `--accent2`, comments `--muted` (Python, R, shell, JavaScript). Each code line is one `<text>` with coloured `<tspan>` runs.
- `"lines":[[3,4]]` reads as the range `[3,4]`; the README pack line shows `"lines":[3]` and `[3,4]`.
- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.0 (components 2.6.0)

- Line-by-line code walkthroughs, stacked notes and supplied output; Japanese/English labels.
- Deterministic seeking, faint previews, full accessible text and range/layout/size reports.
- One height formula (code + final note list + output) shared by the README and every height report; no advice above a 440px slide body; compact 24px final list; output that would fall below wide code sits beside the note band.
