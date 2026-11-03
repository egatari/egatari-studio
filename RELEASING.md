<!-- i18n: pair=RELEASING.ja.md sha256=3b3c2ed9eb853b1e -->
# Releasing

English | [日本語](RELEASING.ja.md)

A release is a tag `vX.Y.Z` on `main`. Release candidates are tags `vX.Y.Z-rc.N`; they are evaluated but never deployed. GitHub Pages (the hosted editor) deploys only from a release tag (`.github/workflows/pages.yml`; setup in [docs/editor.md](docs/editor.md#publishing-on-github-pages)).

## Checklist

1. **Release candidate.** First set `COLAB.ref` in `kit/core/colab-core.mjs` to the release tag `vX.Y.Z` (the Colab link of the editor and the notebook's clone use it), run `npm run gen` and commit. Then, on the `main` commit to release, tag and push a candidate:

   **The bundled player.** Files carry `player` {name, version} (format spec §4.1): `kit/player.json` holds Egatari Player's version, and `kit/player.lock.json` the version and SHA-256 of the last released player (the files in `PLAYER_FILES`, `kit/core/player.mjs`: `kit/deck.js`, the `kit/core` modules it bundles, `presenter.js`, `tools.js`, `shape.js`, the runtime CSS and the Live player). A build whose player files equal the lock writes the plain version; any other build writes `<version>+dev.<commit>` (`+dev` without git). Before tagging an rc, run `npm run player:check -- --strict`; if the player changed since its last release, run `npm run player:bump -- patch|minor|major` (the first release is `major`: 1.0.0), fill in `changes/player-<version>.md`, run `npm run gen:check` and commit, so that the candidate's files carry the plain player version. On branches `npm run player:check` only informs.

   **The spec snapshot.** Before tagging an rc, `vendor/egatari-spec` must equal the latest `wd-*` snapshot of egatari-spec (`vendor/egatari-spec/SOURCE.json` has `"snapshot": "wd-YYYY-MM-DD"`, and `node tools/spec-snapshot.mjs --check` prints `ok`). Sync with `node tools/sync-spec.mjs <spec clone> --ref wd-YYYY-MM-DD`. If the spec has changed since its latest snapshot, ask the spec maintainer to cut a new snapshot first.

   ```bash
   git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N
   ```

2. **Evaluation.** Check the maintainers' nightly evaluation (run with the format spec's experiment tools; ask the maintainer for the summary of the candidate commit): tier A (re-scoring saved replies) shows **0 changed** — if not 0, confirm every difference is an intended change — and tier B (new generation) shows no large drop in the pass rate after fixes compared with recent nights. Otherwise fix on `main` and make a new candidate.
3. **CI green on `main`.** The `test` and `pages` (build only) workflows pass for the candidate's commit: `gh run list --branch main --limit 5`.
   The `test` workflow includes the self-containment checks (backlog #50); all must be green:
   - `npm test` on Linux (Node 22 and 24), Windows and **macOS** (`test`, `windows`, `macos` jobs; three steps at a time on Linux and Windows, one at a time on macOS, timing-sensitive tests last and alone). If a test fails there but passes alone, run `npm test -- --jobs 1` to tell a test that does not tolerate running alongside others from a real failure
   - `tools/test-selfcontained.mjs` (in `npm test`): no personal paths, private addresses, secrets locations or personal voice names in tracked files; `localhost:8882` only as the default of `IRODORI_URL`; `skills/` names only the bundled skills; the paths, links and `npm run` scripts that documents name exist; `kit/` and `server/` do not import `tts/` or `render/`
   - the `clean` job on Linux, Windows and macOS: `node tools/clean-env.mjs` with an empty `HOME` and no TTS server builds, quality-checks and exports (`--portable`, `--play-only`) every example, runs `tts/synth.py --dry-run` and builds with its audio, and builds a deck from `npm run new`. Run it locally too: `node tools/clean-env.mjs`
   - the `pack` job on Linux, Windows and macOS: `node tools/test-npm-pack.mjs` packs the npm package `egatari`, installs the tarball outside the repository and runs `npx egatari` (`--version`, `doctor`, `new`, `check`, `build`, `build --portable`)
4. **Changelog.** Check the section, then assemble it (this also sets the version in `package.json` and `package-lock.json` and deletes `changes/*.md`):

   ```bash
   node tools/changelog.mjs --preview X.Y.Z
   node tools/changelog.mjs --release X.Y.Z
   npm run gen:check
   git commit -am "vX.Y.Z：CHANGELOG を版にまとめ、版を X.Y.Z にする"
   ```

   Only `CHANGELOG.md`, `changes/` and the version change between the candidate and this commit.
5. **No session links.** Before every push (commits and tags):

   ```bash
   git log origin/main..HEAD --format=%B | grep -ci claude-session   # must print 0
   ```

   **No personal environment.** Nothing in the release may need the maintainer's computer: personal paths, addresses, secrets or voices, or a skill that is not in `skills/`. `tools/test-selfcontained.mjs` checks this (it is in `npm test` and CI; see step 3); run it once more on the release commit:

   ```bash
   node tools/test-selfcontained.mjs
   ```

   Push `main` and wait for CI to pass again.
6. **Tag.** Tag the release commit and push the tag; this deploys GitHub Pages and publishes the npm package `egatari` with provenance (`.github/workflows/npm.yml`: `latest` for vX.Y.Z, `next` for an rc tag; trusted publishing, no token; only while the repository variable `NPM_PUBLISH` is `true`):

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **Release notes** from the CHANGELOG section. They name the snapshot: "Follows Egatari 1.0 Working Draft YYYY-MM-DD"; state any exception. Attach the example files, both make skill ZIPs (`egatari-make-X.Y.Z-ja.zip` and `egatari-make-X.Y.Z-en.zip`, generated by `npm run release:assets`), and the editor site. The editor site `editor-site-vX.Y.Z.tar.gz` is this release's `dist/`, built from the tag in a temporary git worktree; later deploys serve it at `/vX.Y.Z/` and check it against the sha256 line in the notes ([docs/editor.md](docs/editor.md#versions-frozen-copies)):

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   node tools/site-versions.mjs asset vX.Y.Z          # out/site/editor-site-vX.Y.Z.tar.gz and its sha256 line
   printf '\n' >> /tmp/notes.md && cat out/site/editor-site-vX.Y.Z.sha256.txt >> /tmp/notes.md
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/* out/site/editor-site-vX.Y.Z.tar.gz
   node tools/site-versions.mjs verify vX.Y.Z         # downloads the asset and checks it against the notes and GitHub's digest
   ```

8. **Pages.** The `pages` workflow for the tag deploys; check that its run deployed (`gh run list --workflow pages --limit 3`) and open <https://studio.egatari.org/>, <https://studio.egatari.org/vX.Y.Z/>, the previous release's `/v…/` (its log lists the frozen copies it added) and <https://studio.egatari.org/parts/> (the samples of all parts; the log also says which release each version's page came from). To deploy a release again, run the workflow on its tag (Actions → pages → Run workflow).
   Also check the compressed response, which a browser gets: `curl -s -o /dev/null -w "%{http_code}" -H "Accept-Encoding: gzip, deflate, br, zstd" https://studio.egatari.org/` must print `200` (a cached compressed 404 can survive a domain change).

## @egatari/fonts-extra

The package `egatari` carries only the default fonts (BIZ UDPGothic, BIZ UDPMincho, Source Sans 3). The 7 optional fonts (`extra` in `FONT_LIST`, `kit/core/build-core.mjs`) are the separate package `@egatari/fonts-extra` in `packages/fonts-extra/`, with its own version; `egatari` lists it as an optional peer dependency (`^1.0.0`). `tools/fonts-vendor.mjs` (its `prepack`, and `egatari`'s) builds its copy from the `@fontsource` devDependencies, and `tools/test-npm-pack.mjs` packs it and builds a lesson with an optional font from it. Publish a new version only when its fonts change (a bump of an optional `@fontsource` devDependency, or a change of the list or the weights).

**First publish (by hand, once).** A scoped package must exist before trusted publishing can be set up for it. From a clean checkout of the release commit, signed in to npm as an owner of the `@egatari` scope:

```bash
npm ci
cd packages/fonts-extra
npm pack --dry-run          # 7 families, no default fonts; prepack builds @fontsource/
npm publish --access public
```

Then on npmjs.com, package `@egatari/fonts-extra` → Settings → Trusted publishing → GitHub Actions, with these fields:

| field | value |
|---|---|
| Organization or user | `egatari` |
| Repository | `egatari-studio` |
| Workflow filename | `npm-fonts-extra.yml` |
| Environment name | `npm` |

If the `npm` environment limits its deployment tags (Settings → Environments → npm), also allow `fonts-extra-v*`.

**Later versions.** Bump `version` in `packages/fonts-extra/package.json` (and the peer range in the root `package.json` on a major bump), merge, then tag the commit and push the tag; `.github/workflows/npm-fonts-extra.yml` checks that the tag equals the version, runs `tools/test-npm-pack.mjs` and publishes with provenance (only while `NPM_PUBLISH` is `true`):

```bash
git tag -a fonts-extra-vX.Y.Z -m fonts-extra-vX.Y.Z && git push origin fonts-extra-vX.Y.Z
```

## Before v0.6.5

Delete the moved-notice stubs `skills/motion-slides`, `skills/motion-slides-video` and `skills/motion-components` (kept for v0.6.4 only) and their assertions in `tools/test-plugin.mjs`. `egatari doctor` keeps checking for old `~/.claude/skills/motion-*` entries.
