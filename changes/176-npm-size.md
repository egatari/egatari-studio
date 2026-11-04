### Changed

- The npm package `egatari` is smaller (55.5 MB to 29.8 MB unpacked, 43.7 MB to 22.0 MB packed): it leaves out the vendored parts'
  README, demo and changelog files (`vendor/.npmignore`; the build, dev server and check read only `index.js`, and the repository keeps
  the full copy), the default TTS voices (7.9 MB) and the 6 optional fonts that no bundled theme uses (16.0 MB)
- Those fonts (Shippori Mincho, Klee One, Source Serif 4, Andika, Atkinson Hyperlegible Next, Source Code Pro) are the new package
  `@egatari/fonts-extra` (`packages/fonts-extra/`; an optional peer dependency of `egatari`). The default fonts and every font of a
  bundled theme (Zen Maru Gothic of `asagi`) stay in `egatari`, so every bundled theme works from `npx egatari` alone. The build finds
  fonts-extra from the `egatari` package and from the current folder; without it, a lesson whose CSS or own theme names one of its fonts
  gets a build warning and the check error `fontsExtraMissing` with `npm i -D @egatari/fonts-extra`, never a silent fallback.
  A tag `fonts-extra-vX.Y.Z` publishes it (`.github/workflows/npm-fonts-extra.yml`; the first version by hand, RELEASING.md)
- `egatari tts` downloads a default voice (`bob`, `alice`, `bob_en`, `alice_en`) that is not in `tts/voices/` on first use, from this
  repository at the tag pinned in `tts/voices.json`; it refuses a file whose sha256 differs and keeps it in the user's cache folder
  (`<cache>/egatari/voices/<tag>/`). Offline, it names the URL and the place to put the file by hand. A checkout uses `tts/voices/`

### Added

- `egatari doctor` checks every vendored part's `index.js` against `components.lock.json` and the manifests' per-file sha256 (`parts`),
  and says where the default voices are (`voices`)
