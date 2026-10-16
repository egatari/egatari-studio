# Contributing

English | [日本語](CONTRIBUTING.ja.md)

Feedback and new components are both welcome. Small reports help as much as pull requests.

## Feedback

- **From a deck**: press `?` and click **Send feedback** at the bottom (also in the presenter view's key row). It opens the [feedback form](https://github.com/moiku/motion-academic-slides/issues/new?template=feedback.yml) with only the version, browser, OS, deck language and mode filled in. Nothing from your slides is sent; add a snippet yourself only if it is public
- **From Claude Code**: say "send feedback" / 「感想を送って」. The `motion-slides` skill summarizes the problems from the session into a draft issue, shows it to you, and creates it only after you confirm. It leaves out deck text, voices and local paths
- **Questions** go to [Discussions → Q&A](https://github.com/moiku/motion-academic-slides/discussions/categories/q-a); decks and videos you made to [Show and tell](https://github.com/moiku/motion-academic-slides/discussions/categories/show-and-tell)
- **Security issues**: see [SECURITY.md](SECURITY.md), not a public issue

## Components

### 1. Ask first, or write it in your deck

- Check [components/CATALOG.md](components/CATALOG.md). Often a new attribute on an existing component is enough
- If you only have an idea, open a [component request](https://github.com/moiku/motion-academic-slides/issues/new?template=component-request.yml): what to animate, the paper or figure, a sketch, and what each step shows
- To write it yourself, start **deck-local**: `<deck>/components/<name>/index.js`. The build looks in the deck first, then in the repository. The `motion-components` skill walks through this

### 2. When a component is ready for the library

Move it to `components/<name>/` when either holds:

- a second deck uses it, or
- it no longer depends on its deck: all text and numbers come in through attributes (`props`) or the child JSON

### 3. Pull request checklist

Open a PR (or a [component submission](https://github.com/moiku/motion-academic-slides/issues/new?template=component-submission.yml) issue with the code pasted) with:

- [ ] `components/<name>/README.md` with frontmatter `name`, `summary`, `steps`, `props`, and a body saying when to use it
- [ ] `components/<name>/demo.html`: a 1–2 slide sample deck
- [ ] `node tools/test-components.mjs <name>` passes, and you looked at the screenshots (mid-step and final)
- [ ] colors only through theme variables: `var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)`
- [ ] deterministic `render(k, t)`: no `setTimeout`, `requestAnimationFrame`, `Date` or unseeded random; `t = Infinity` is the final state of step `k`
- [ ] `node tools/catalog.mjs` re-run (CATALOG.md is generated; do not edit it by hand)
- [ ] `npm test` passes

## Running the tests

```bash
npm install
npm test                 # all tests (needs Chrome, or Playwright's Chromium)
node tools/test-all.mjs --only test-components,test-tools
```

CI runs `npm test` on Node 22 and 24 for every push and pull request.

## Coding rules

[docs/contract.md](docs/contract.md) (Japanese: [docs/contract.ja.md](docs/contract.ja.md)) is the source of truth; change it first (both languages) when you change the runtime, components, narration or timeline. In short:

- the screen is determined by `DECK.seek(i, k, t)` alone (video export depends on it)
- no hard-coded colors; institution-specific things (colors, logos) live only in `themes/<name>/`
- `kit/` and `server/` never import `tts/` or `render/`; slides work without audio
- figure text is 24px or larger, labels go next to the lines rather than in a legend
- no personal paths or addresses in the repository; configure through environment variables

## License

By contributing you agree that your contribution is released under the [MIT License](LICENSE).
