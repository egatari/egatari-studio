---
summary: Code run line by line (tracer output); current line, changed variables, output
steps: trace lines (time: 1)
props:
  dur: s per step
  by: step or time
  rate: lines/s
  size: text px
example: {"lang":"python","code":"total = 0\nfor x in [3, 1]:\n    total += x\nprint(total)","source":{"tool":"egatari-trace 0.1","python":"3.13.1","sha256":"","truncated":false},"steps":[{"line":1,"vars":{"total":0}},{"line":2,"vars":{"total":0,"x":3}},{"line":3,"vars":{"total":3,"x":3}},{"line":2,"vars":{"total":3,"x":1}},{"line":3,"vars":{"total":4,"x":1}},{"line":2,"vars":{"total":4,"x":1}},{"line":4,"vars":{"total":4,"x":1},"out":"4\n"}]}
---

JSON from `uv run tools/trace.py prog.py --out trace.json`, never by hand.
<!-- llm: omit -->
- Not in any chat pack (tier local): an AI chatbot cannot run the tracer. Use it from Claude Code or locally.
- `steps[i]`: `line` or `lines: [a, b]`, `vars` (the FULL state after the line, not a delta), `out` (what the line printed), `note` (added by hand after tracing, ≤2 band rows).
- Values: numbers, strings (≤40 chars), booleans, null, lists (≤12, or 2-D ≤6×6), dicts (≤8 keys), nesting ≤2, else `{"repr": "…"}`.
- Caps: 16 code lines, 60 steps, 6 variables (`show` picks them), 8 output lines.
- `by="time"` plays the whole trace inside one step at `rate` lines/s; cues are the line times.
- Current line: emph ground and bold number. Changed variables: emph text, ground and bold.
- Code and output in `pre[data-readable]`; final variables in `table[data-readable]`. No preview of later steps.
<!-- llm: end -->

Demo: `demo.html` (a for-loop sum, counting words in a dict, bubble sort with by="time"); traces from `tools/trace-demo/` through `tools/trace.py`.

<!-- llm: omit -->
Notes

- The tracer runs the code locally. Trace short teaching code, not code that touches files or the network.
- A for line becomes one more step when the loop ends (that is how Python runs it); say so in the notes.
<!-- llm: end -->
