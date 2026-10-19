<!-- i18n: pair=CONTRIBUTING.ja.md sha256=817582a0a9c06592 -->
# Contributing

English | [日本語](CONTRIBUTING.ja.md)

Feedback and new components are both welcome. Small reports help as much as pull requests.

## Feedback

- **From a deck**: press `?` and click **Send feedback** at the bottom (also in the presenter view's key row). It opens the [feedback form](https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml) with only the version, browser, OS, deck language and mode filled in. Nothing from your slides is sent; add a snippet yourself only if it is public
- **From Claude Code**: say "send feedback" / 「感想を送って」. The `motion-slides` skill summarizes the problems from the session into a draft issue, shows it to you, and creates it only after you confirm. It leaves out deck text, voices and local paths
- **Questions** go to [Discussions → Q&A](https://github.com/egatari/egatari-studio/discussions/categories/q-a); decks and videos you made to [Show and tell](https://github.com/egatari/egatari-studio/discussions/categories/show-and-tell)
- **Security issues**: see [SECURITY.md](SECURITY.md), not a public issue

## Components

### 1. Ask first, or write it in your deck

- Check [components/CATALOG.md](components/CATALOG.md). Often a new attribute on an existing component is enough
- If you only have an idea, open a [component request](https://github.com/egatari/egatari-studio/issues/new?template=component-request.yml): what to animate, the paper or figure, a sketch, and what each step shows
- To write it yourself, start **deck-local**: `<deck>/components/<name>/index.js`. The build looks in the deck first, then in the repository. The `motion-components` skill walks through this

### 2. When a component is ready for the library

Move it to `components/<name>/` when either holds:

- a second deck uses it, or
- it no longer depends on its deck: all text and numbers come in through attributes (`props`) or the child JSON

### 3. Pull request checklist

Open a PR (or a [component submission](https://github.com/egatari/egatari-studio/issues/new?template=component-submission.yml) issue with the code pasted) with:

- [ ] `components/<name>/README.md` with frontmatter `name`, `summary`, `steps`, `props`, and a body saying when to use it
- [ ] `components/<name>/demo.html`: a 1–2 slide sample deck
- [ ] `node tools/test-components.mjs <name>` passes, and you looked at the screenshots (mid-step and final)
- [ ] colors only through theme variables: `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)`
- [ ] deterministic `render(k, t)`: no `setTimeout`, `requestAnimationFrame`, `Date` or unseeded random; `t = Infinity` is the final state of step `k`
- [ ] `npm run gen` re-run (CATALOG.md and the AI instruction pack are generated; do not edit them by hand)
- [ ] a `changes/<name>.md` fragment (see [Changelog](#changelog))
- [ ] `npm test` passes

## Running the tests

```bash
npm install
npm test                 # all tests (needs Chrome, or Playwright's Chromium)
node tools/test-all.mjs --only test-components,test-tools
```

CI runs `npm test` on Node 22 and 24 (Linux), on Windows and on macOS for every push and pull request, and `node tools/clean-env.mjs` (an empty `HOME`, no TTS server) on all three. `node tools/test-all.mjs --list` prints every step and its arguments.

Unit tests are found, not listed: a `tools/test-*.mjs` with the line `// test-all: unit` near the top runs with no arguments (it must not need a browser). Tests that need arguments, a built deck or a fixed place in the order are steps written out in `tools/test-all.mjs`. A test that another test imports says `// test-all: part of <step>`. `npm test` fails before running anything if a `tools/test-*.mjs` is none of these, so a new test is not forgotten.

### Interface shapes

`tools/test-api-shapes.mjs` (in `npm test`) compares the structure (keys and types, not text) of the interfaces other code and tools rely on with the snapshot `tools/fixtures/api-shapes.json`: the output of `kit/check.mjs --json`, the parameters and result of `buildFixRequest` (`kit/core/llm-fix.mjs`), of `buildPack` (`kit/core/llm-pack.mjs`) and the `assemble` it calls, and the results of `extractBlocks`, `mergeSlides` and `mergeNarration` (`kit/core/llm-import.mjs`). To change one of them on purpose, run `node tools/test-api-shapes.mjs --update` (it widens the snapshot; narrow it by hand), and add a fragment under `### Changed (API)`.

## Generated files

These files are generated and committed (GitHub Pages, the editor and users read them as they are). Do not edit them by hand; change their sources and run `npm run gen`:

| File | Generator | Sources |
|---|---|---|
| `components/CATALOG.md` | `tools/catalog.mjs` | the frontmatter of `components/*/README.md` |
| `docs/authoring-with-llms(.ja).md`, `docs/llm-parts/*.md`, `kit/core/llm-pack-data.mjs` | `tools/make-llm-guide.mjs` | `tools/llm-guide/`, `docs/contract*.md`, the component READMEs and `index.js` |
| `kit/core/katex-ranges.mjs` | `tools/katex-ranges.mjs` | the KaTeX fonts in `node_modules` (after a KaTeX update) |

`npm run gen:check` runs each generator with `--check` (fails when a file differs from what its sources give) and checks the changelog fragments; `npm test` runs the same checks, and CI runs them in a separate quick job. The i18n stamps are not generated: they record that a person compared both languages (see [Translations](#translations-english-and-japanese)).

## Changelog

Each change that users or callers will notice adds a fragment instead of editing `CHANGELOG.md`: a file `changes/<short-name>.md` (lowercase letters, digits, `.`, `_`, `-`) with a section header line and short entries (1–2 lines each; continuation lines are indented):

```markdown
### Fixed

- Editor app: **Export single file** keeps the attachments of the opened file
```

The sections are `Added`, `Changed (API)` (a change to the shapes in [Interface shapes](#interface-shapes) or another interface callers use), `Changed`, `Removed`, `Fixed` and `Security`; one fragment may have several. Entries are in English, like the rest of `CHANGELOG.md`. `## [Unreleased]` in `CHANGELOG.md` stays empty. At a release, `node tools/changelog.mjs --release X.Y.Z` puts the fragments (in that section order, by file name within a section) under `## [X.Y.Z] - <date>`, updates the compare links, sets the version in `package.json` and `package-lock.json` and deletes the fragments; `--preview` prints the section without writing anything, and `--check` (in `npm test`) checks the fragments. In CI, a pull request that changes code (`app/`, `kit/`, `components/`, `server/`, `render/`, `tts/`, `themes/`, `lab/`, `skills/`, `package.json`) without adding a fragment gets a warning; it does not fail. Releasing is described in [RELEASING.md](RELEASING.md).

## Coding rules

[docs/contract.md](docs/contract.md) (Japanese: [docs/contract.ja.md](docs/contract.ja.md)) is the source of truth; change it first (both languages) when you change the runtime, components, narration or timeline. In short:

- the screen is determined by `DECK.seek(i, k, t)` alone (video export depends on it)
- no hard-coded colors; institution-specific things (colors, logos) live only in `themes/<name>/`
- `kit/` and `server/` never import `tts/` or `render/`; slides work without audio
- figure text is 24px or larger, labels go next to the lines rather than in a legend
- no personal paths or addresses in the repository; configure through environment variables (`tools/test-selfcontained.mjs` checks this, the skill names in `skills/`, the paths documents name and the `kit/`/`server/` imports)

## Translations (English and Japanese)

Documents come in pairs: `X.md` (English, the source) and `X.ja.md` (Japanese), for example `README.md` / `README.ja.md` and `docs/*.md`. The first line of each file is an invisible comment recording a hash of its counterpart at the last sync:

```html
<!-- i18n: pair=README.ja.md sha256=0123456789abcdef -->
```

`npm run i18n -- --check` (also run by `npm test` and CI) warns when a file is older than its counterpart, that is, when the counterpart changed after the recorded hash, or when the comment is missing. It only warns and does not fail the build; `--strict` makes it exit 1. The hash ignores this comment line, line endings (CRLF / LF) and trailing whitespace.

When you change one side:

1. Edit `X.md` (or `X.ja.md`) as usual. Changing only one language is fine; the check will remind whoever updates the other
2. Bring the other file up to date, section by section
3. After checking that both say the same thing, record it: `npm run i18n -- --stamp X.ja.md` (either file of the pair works; both first lines are rewritten). Do not stamp a pair you have not compared
4. Commit both files

`npm run i18n -- --stamp-all` stamps every pair at once; use it only when setting up a new set of documents that you know are in sync.

## License

By contributing you agree that your contribution is released under the [MIT License](LICENSE).
