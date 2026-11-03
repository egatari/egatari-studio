### Added

- `node tools/changelog.mjs --rc X.Y.Z-rc.N` sets only the version in `package.json` and `package-lock.json` for a release candidate, so the rc tag equals "v" + the version (what `npm.yml` requires) and the candidate publishes to the `next` dist-tag

### Fixed

- `tools/site-versions.mjs assemble` (and so the `pages` workflow's build on an rc tag) no longer fails with `bad current version` when `package.json` is `X.Y.Z-rc.N`: it makes no `/v…/` copy for an rc and lists full releases only (RELEASING.md)
