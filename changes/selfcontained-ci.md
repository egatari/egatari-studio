### Added

- CI: `npm test` on macOS, and a `clean` job on Linux, Windows and macOS (`tools/clean-env.mjs`: an empty `HOME`, no TTS
  server; builds, checks and exports every example, `tts/synth.py --dry-run`, `npm run new`)
- `tools/test-selfcontained.mjs` (in `npm test`): no personal paths, private addresses or secrets locations in tracked files,
  only bundled skills named in `skills/`, the paths and npm scripts documents name exist, `kit/` and `server/` do not import
  `tts/` or `render/`
