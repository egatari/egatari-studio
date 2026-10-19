### Changed

- Development: GitHub Pages deploys only from release tags `vX.Y.Z` (pushes to `main` and pull requests only build); changes are recorded as `changes/*.md` fragments that `node tools/changelog.mjs --release X.Y.Z` assembles; `npm run gen` / `npm run gen:check` for the generated files; `npm test` finds unit tests by a `// test-all: unit` line and compares interface shapes with a snapshot (`tools/test-api-shapes.mjs`). See CONTRIBUTING.md and RELEASING.md
