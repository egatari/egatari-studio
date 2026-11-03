### Changed

- The npm package `egatari` is smaller: it leaves out the vendored parts' README, demo and changelog files (`vendor/.npmignore`; the build,
  dev server and check read only `index.js`, and the repository keeps the full copy) and the default TTS voices (7.9 MB)
- `egatari tts` downloads a default voice (`bob`, `alice`, `bob_en`, `alice_en`) that is not in `tts/voices/` on first use, from this
  repository at the tag pinned in `tts/voices.json`; it refuses a file whose sha256 differs and keeps it in the user's cache folder
  (`<cache>/egatari/voices/<tag>/`). Offline, it names the URL and the place to put the file by hand. A checkout uses `tts/voices/`

### Added

- `egatari doctor` checks every vendored part's `index.js` against `components.lock.json` and the manifests' per-file sha256 (`parts`),
  and says where the default voices are (`voices`)
