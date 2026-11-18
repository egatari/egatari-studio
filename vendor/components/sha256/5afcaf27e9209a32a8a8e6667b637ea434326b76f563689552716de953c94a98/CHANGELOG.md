# m-trace changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.1 (components 2.14.0)

- Requires base 1.3.0, code-core 1.0.1 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.0 (components 2.12.0)

- New part (tier `local`): a short program's execution traced line by line, drawn from the JSON that `tools/trace.py` (sys.settrace) writes. The part never runs code.
  - The current line is marked; variables that changed since the previous step are marked; the output so far is shown.
  - Long code scrolls with the current line centred and soft-wraps long lines (code-core).
  - `by="time"` plays the whole trace inside one step at `rate` lines per second.
- Checks the line numbers, the value grammar and the caps (16 lines, 60 steps, 6 variables, 8 output lines).
- Code and output in `pre[data-readable]`; the final variables in `table[data-readable]`.
