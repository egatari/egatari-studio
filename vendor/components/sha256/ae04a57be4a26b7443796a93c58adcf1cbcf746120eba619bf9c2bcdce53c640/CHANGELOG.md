# m-code changelog

## 2.1.0 (components 2.7.0)

- Syntax colouring with theme roles only: keywords `--term`, strings `--accent2`, comments `--muted` (Python, R, shell, JavaScript). Each code line is one `<text>` with coloured `<tspan>` runs.
- `"lines":[[3,4]]` reads as the range `[3,4]`; the README pack line shows `"lines":[3]` and `[3,4]`.
- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.0 (components 2.6.0)

- Line-by-line code walkthroughs, stacked notes and supplied output; Japanese/English labels.
- Deterministic seeking, faint previews, full accessible text and range/layout/size reports.
- One height formula (code + final note list + output) shared by the README and every height report; no advice above a 440px slide body; compact 24px final list; output that would fall below wide code sits beside the note band.
