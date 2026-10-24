<!-- i18n: pair=RELEASING.ja.md sha256=0697a8b2a2e53b92 -->
# Releasing

English | [日本語](RELEASING.ja.md)

A release is a tag `vX.Y.Z` on `main`. Release candidates are tags `vX.Y.Z-rc.N`; they are evaluated but never deployed. GitHub Pages (the hosted editor) deploys only from a release tag (`.github/workflows/pages.yml`; setup in [docs/editor.md](docs/editor.md#publishing-on-github-pages)).

## Checklist

1. **Release candidate.** First set `COLAB.ref` in `kit/core/colab-core.mjs` to the release tag `vX.Y.Z` (the Colab link of the editor and the notebook's clone use it), run `npm run gen` and commit. Then, on the `main` commit to release, tag and push a candidate:

   **The spec snapshot.** Before tagging an rc, `vendor/egatari-spec` must equal the latest `wd-*` snapshot of egatari-spec (`vendor/egatari-spec/SOURCE.json` has `"snapshot": "wd-YYYY-MM-DD"`, and `node tools/spec-snapshot.mjs --check` prints `ok`). Sync with `node tools/sync-spec.mjs <spec clone> --ref wd-YYYY-MM-DD`. If the spec has changed since its latest snapshot, ask the spec maintainer to cut a new snapshot first.

   ```bash
   git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N
   ```

2. **Evaluation.** Check the maintainers' nightly evaluation (run with the format spec's experiment tools; ask the maintainer for the summary of the candidate commit): tier A (re-scoring saved replies) shows **0 changed** — if not 0, confirm every difference is an intended change — and tier B (new generation) shows no large drop in the pass rate after fixes compared with recent nights. Otherwise fix on `main` and make a new candidate.
3. **CI green on `main`.** The `test` and `pages` (build only) workflows pass for the candidate's commit: `gh run list --branch main --limit 5`.
   The `test` workflow includes the self-containment checks (backlog #50); all must be green:
   - `npm test` on Linux (Node 22 and 24), Windows and **macOS** (`test`, `windows`, `macos` jobs)
   - `tools/test-selfcontained.mjs` (in `npm test`): no personal paths, private addresses, secrets locations or personal voice names in tracked files; `localhost:8882` only as the default of `IRODORI_URL`; `skills/` names only the bundled skills; the paths, links and `npm run` scripts that documents name exist; `kit/` and `server/` do not import `tts/` or `render/`
   - the `clean` job on Linux, Windows and macOS: `node tools/clean-env.mjs` with an empty `HOME` and no TTS server builds, quality-checks and exports (`--portable`, `--play-only`) every example, runs `tts/synth.py --dry-run` and builds with its audio, and builds a deck from `npm run new`. Run it locally too: `node tools/clean-env.mjs`
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

   **No personal environment.** Nothing in the release may need the maintainer's machine: personal paths, addresses, secrets or voices, or a skill that is not in `skills/`. `tools/test-selfcontained.mjs` checks this (it is in `npm test` and CI; see step 3); run it once more on the release commit:

   ```bash
   node tools/test-selfcontained.mjs
   ```

   Push `main` and wait for CI to pass again.
6. **Tag.** Tag the release commit and push the tag; this deploys GitHub Pages:

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **Release notes** from the CHANGELOG section. They name the snapshot: "Follows Egatari 1.0 Working Draft YYYY-MM-DD"; state any exception. Attach the example files and the editor site. The editor site `editor-site-vX.Y.Z.tar.gz` is this release's `dist/`, built from the tag in a temporary git worktree; later deploys serve it at `/vX.Y.Z/` and check it against the sha256 line in the notes ([docs/editor.md](docs/editor.md#versions-frozen-copies)):

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   node tools/site-versions.mjs asset vX.Y.Z          # out/site/editor-site-vX.Y.Z.tar.gz and its sha256 line
   printf '\n' >> /tmp/notes.md && cat out/site/editor-site-vX.Y.Z.sha256.txt >> /tmp/notes.md
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/* out/site/editor-site-vX.Y.Z.tar.gz
   node tools/site-versions.mjs verify vX.Y.Z         # downloads the asset and checks it against the notes and GitHub's digest
   ```

8. **Pages.** The `pages` workflow for the tag deploys; check that its run deployed (`gh run list --workflow pages --limit 3`) and open <https://studio.egatari.org/>, <https://studio.egatari.org/vX.Y.Z/> and the previous release's `/v…/` (its log lists the frozen copies it added). To deploy a release again, run the workflow on its tag (Actions → pages → Run workflow).
   Also check the compressed response, which a browser gets: `curl -s -o /dev/null -w "%{http_code}" -H "Accept-Encoding: gzip, deflate, br, zstd" https://studio.egatari.org/` must print `200` (a cached compressed 404 can survive a domain change).
