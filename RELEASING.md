<!-- i18n: pair=RELEASING.ja.md sha256=1e07c949dcc67b19 -->
# Releasing

English | [日本語](RELEASING.ja.md)

A release is a tag `vX.Y.Z` on `main`. Release candidates are tags `vX.Y.Z-rc.N`; they are evaluated but never deployed. GitHub Pages (the hosted editor) deploys only from a release tag (`.github/workflows/pages.yml`; setup in [docs/editor.md](docs/editor.md#publishing-on-github-pages)).

## Checklist

1. **Release candidate.** On the `main` commit to release, tag and push a candidate:

   ```bash
   git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N
   ```

2. **Evaluation.** Check the maintainers' nightly evaluation (run with the format spec's experiment tools; ask the maintainer for the summary of the candidate commit): tier A (re-scoring saved replies) shows **0 changed** — if not 0, confirm every difference is an intended change — and tier B (new generation) shows no large drop in the pass rate after fixes compared with recent nights. Otherwise fix on `main` and make a new candidate.
3. **CI green on `main`.** The `test` and `pages` (build only) workflows pass for the candidate's commit: `gh run list --branch main --limit 5`.
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

   Push `main` and wait for CI to pass again.
6. **Tag.** Tag the release commit and push the tag; this deploys GitHub Pages:

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **Release notes** from the CHANGELOG section, with the example files attached:

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/*
   ```

8. **Pages.** The `pages` workflow for the tag deploys; check that its run deployed (`gh run list --workflow pages --limit 3`) and open <https://editor.egatari.org/>. To deploy a release again, run the workflow on its tag (Actions → pages → Run workflow).
