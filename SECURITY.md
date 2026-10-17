# Security

## Trust model: a deck is code

Treat a deck folder like a source-code repository, not like a document. Build, check, render or serve only decks you trust.

- **Scripts run.** Inline `<script>` in `deck.html`, components (`components/<name>/index.js`, deck-local ones first) and component attribute expressions run in the browser that opens the built HTML, and in the headless Chrome used by `kit/check.mjs`, `tools/pdf.mjs`, `render/` and the tests (Playwright).
- **Build reads local files, inside the deck folder only.** `/*INCLUDE:…*/`, `{{JSON:…}}`, `{{FIG:…}}`, `narration.md`, `timeline.json`, `macros.tex`, `audio/manifest.json` and referenced assets (`<img src>`, `<link rel="stylesheet">`, CSS `url()`, …) are resolved relative to the deck folder (`INCLUDE` also searches `kit/`). Paths that leave the folder, through `../`, an absolute path or a symbolic link, are refused with a warning and nothing is read. A deck's `<html data-theme>` may only name a theme in the deck folder or in `themes/` (a `--theme` given on the command line is trusted).
- **Build output is self-contained.** Local assets are embedded as data URIs. `http(s)` references are left as they are, and the build warns that the deck is then not fully offline.
- **The dev server is local-only.** `server/dev.mjs` listens on `127.0.0.1` only, accepts only `Host: 127.0.0.1:<port>` or `localhost:<port>` (against DNS rebinding), and writes (text edits, narration, comments) need JSON, a same-origin request and a per-run token. It writes only inside the deck folder (`deck.html`, `narration.md`, `comments.json`, `.cache/`). Do not expose it to a network or put it behind a proxy.
- **Deck code can edit its own source while you edit it.** In the dev server and in the editor app, the editing UI runs inside the deck page, so code in the deck (an inline script or a component) can send the same edit requests as the UI: it can rewrite `deck.html`, `narration.md` and `comments.json` of the deck you opened (nothing outside that folder; the previous version is kept in `.cache/edits/`). Open for editing only decks, and copy into your deck only components, that you trust. Version 0.3 moves the editing UI out of the deck page so that the deck can no longer authorize writes.
- **TTS and video** (tier 2) send narration text to the TTS server in `IRODORI_URL` (default `http://localhost:8882`). Point it only at a server you run or trust.

`comments.json`, `.cache/`, `.env*` and `*.local.json` are gitignored so that review notes, edit history and local settings are not published by accident.

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** button (Security → Advisories) on <https://github.com/moiku/motion-academic-slides>, rather than in a public issue. Include the affected file or command, a minimal deck that reproduces it, and the impact. You should get a reply within two weeks. There is no bug bounty.
