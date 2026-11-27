### Fixed

- npm package: `egatari tts` failed because `tools/narration-json.mjs`, which `tts/synth.py` runs to read the script, was not in the package. It is now included, and the package test checks that every `tools/*.mjs` named by the packaged scripts is in the package (handoff #115)
