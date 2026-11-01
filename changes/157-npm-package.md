### Added

- npm package `egatari` with the command `egatari` (`npx egatari new|build|check|dev|ids|portable|video|tts|doctor`, `--help`, `--version`);
  relative paths are resolved from the current folder. `egatari doctor` reports Node, uv, ffmpeg and a browser, with install hints.
  `egatari tts` keeps its Python environment in the user's cache folder (`UV_PROJECT_ENVIRONMENT` overrides it)

### Changed

- The `@fontsource` fonts are dev dependencies; the package carries only the weights and WOFF2 files the build embeds, with their
  OFL licences, in `fonts/@fontsource/` (made by `tools/fonts-vendor.mjs` before `npm pack`). The build reads that copy first
- Built players from an installed package write `+dev` without a commit when the player is not a released one: the build no longer
  reads the commit of a git repository the package happens to be inside
