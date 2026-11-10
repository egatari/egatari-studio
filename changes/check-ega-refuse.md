### Fixed

- `egatari check` (and `node kit/check.mjs`) refuses a built `.ega.html` with exit code 2 and the message “.ega.html is a built file. Run the quality check on the source instead (the working folder or deck.html)”; with `--json` it prints `status: "refused"` and no results. It used to read the built file as a deck source and report false overflows, missing narration and overlaps. Checking the source embedded in a `.ega.html` is planned for v0.6.10.
