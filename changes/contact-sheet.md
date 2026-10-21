### Added

- `npm run sheet -- <deck folder | deck.html | built.html | .ega.html> [out.png] [--mode talk] [--cols 4] [--width 640] [--tiles]` (`tools/sheet.mjs`): a contact sheet of every slide at its final step in one PNG (numbered, with the slide key when short), for looking at what the quality check cannot see (a legend with the wrong meaning, points cut at an axis edge). `--tiles` also writes the 1280×720 PNG of each slide. No new dependency. `skills/motion-slides` gets a step for it, and a line on leaving a margin beyond the data range when embedding plots
