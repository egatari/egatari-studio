<!-- generated; do not edit by hand -->
# local parts

Local (CLI) only parts. Made in a CLI such as Claude Code or Codex from the output of a local tool (for example, a tracer's record of running code). They are not in the chat AI instructions. Do not use them when you cannot run the tool.

### `<m-trace>`

JSON from `uv run tools/trace.py prog.py --out trace.json`, never by hand.

Demo: `demo.html` (a for-loop sum, counting words in a dict, bubble sort with by="time"); traces from `tools/trace-demo/` through `tools/trace.py`.

[README](https://github.com/egatari/components/blob/v2.13.0/components/trace/README.en.md)
