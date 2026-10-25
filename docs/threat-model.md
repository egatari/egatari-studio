<!-- i18n: pair=threat-model.ja.md sha256=fc0059bce69431a7 -->
# Threat model

English | [日本語](threat-model.ja.md)

A short map of what Egatari Studio protects, from whom, and where each protection lives in the code. It summarizes [SECURITY.md](../SECURITY.md) (the full list of mechanisms and accepted risks) and [contract.md](contract.md) §11 (Live); when they differ, those documents and the code win. It describes what is built, not what is promised for the future.

## What is protected

- The files on the computer of the person who opens, edits or builds a lesson (outside the lesson's working folder, and the editor's own storage and folder handles).
- Script text and other lesson content, which should leave the machine only where this document says so.
- The integrity of what Studio builds and ships (the editor site, release assets, vendored parts).

## Assumptions

- A working folder is treated like a source-code repository: you build, check or serve only lessons you trust ([SECURITY.md](../SECURITY.md), "Trust model: a deck is code").
- The local machine and other local processes are trusted. Another local user or a process changing the folder while a tool runs is out of scope (SECURITY.md, "Residual risks").
- What you name on the command line or in the environment (lesson path, `--theme`, `-o`, `EGATARI_THEMES`, `IRODORI_URL`) is trusted.

## 1. Authored lessons: untrusted HTML in the preview iframe

**Threat.** A lesson (or the AI's output pasted into the editor, or a downloaded Egatari file) is HTML with inline scripts and parts. It can try to read or write files, reach the network, drive the editor UI, or imitate it.

**What is in place.**
- While you edit, the slides run in a sandboxed iframe with an opaque origin (`sandbox="allow-scripts allow-modals"`, no `allow-same-origin`) under a Content-Security-Policy with `connect-src 'none'` and other resources limited to `data:` / `blob:` (`app/preview-doc.js` `PREVIEW_CSP` for the editor app; `server/dev.mjs` for the dev server, which also allows its own `/deck/audio/`).
- The slides can only send hints (`server/hints.js`); they carry no text to write. The editing UI runs outside the slides, reads the source itself and writes only when you press Save. The editor app asks before it runs a lesson that has code, and decides "has code" from the built content (`kit/core/code-scan.mjs`), not from what an Egatari file declares.
- Reads go through bounded readers (`kit/bounded-read.mjs`, `app/bounded-read.js`; `tools/test-raw-reads.mjs` guards against direct reads). The build refuses paths that leave the working folder (`../`, absolute paths, symbolic links), and budgets bound includes, embeds, formulas and total size. Writes go through `kit/safe-fs.mjs`. Attachments are download-only and never run.
- The editor page itself forbids `eval` (no `'unsafe-eval'`).

**Not covered.** The lesson's own code still runs inside the preview and can draw anything in the slide area, including a fake editor card; only controls in the editor's own panels are trustworthy. The dev server's slides document and `PREVIEW_CSP` keep `'unsafe-eval'` so yanked part versions still play there. Resource use is bounded per budget, not by total process memory or time. `kit/check.mjs`, `tools/pdf.mjs`, `render/` and the tests run a lesson's code in headless Chrome (SECURITY.md), so run them on trusted lessons only.

## 2. Play-only files opened locally

**Threat.** A participant opens a `.ega.html` or play-only copy (`--play-only`) received from someone else, from a `file:` URL.

**What is in place.** A play-only copy has no source, only the slides and audio, and it plays offline. Local assets are embedded as data URIs. Attachments in an Egatari file are never opened or run: the player offers only a download, after checking the index hash, size and SHA-256, as `application/octet-stream`. Packing refuses executables, scripts, HTML, SVG, archives and macro-enabled Office files (`kit/core/attach-content.mjs`). Links that leave the lesson never navigate the lesson's window: the player shows the destination host and full address and opens it only on **Open**, in a new tab with `noopener,noreferrer`; it asks every time when the link text names another host, the address is not `https:`, or the link downloads a file, and refuses `javascript:`, `data:`, `file:` and other schemes (`kit/core/link-policy.mjs`, contract §9; spec §11). A page that plays lessons in a frame applies the same rule to the lesson's `openLink` requests (spec §9.4) in its own interface.

**Not covered.** A play-only file is still a page whose scripts run in your browser when you open it, and nothing in the copy shows whether its author is who you think. Open files only from people you trust, or inside a sandboxed frame. `http(s)` references that an author left in the lesson are not removed; the build warns that the lesson is then not fully offline. What an attachment does after you save and open it is outside Egatari.

## 3. Live: network only inside the live time

**Threat.** A lesson file that contacts a server could leak a participant's presence or input, or be pointed at an unintended server.

**What is in place** (`kit/core/live-policy.mjs`, `kit/live.js`, `kit/core/live.mjs`; contract.md §11).
- Only a play-only copy exported with Live carries the player. Every other output is unchanged.
- The endpoint must be an `https:` origin with no credentials, path, query or fragment (`parseEndpoint`). Loopback `http:` is accepted only by a development build used by tests (a constant in `live-policy.mjs`), not by the distributed player, the editor's export or `kit/build.mjs --live`.
- The player connects only after the participant presses **Join**, only when `inWindow` is true (the live time, with 2 minutes of leeway), and only from a top-level `file:`, `content:` or `http(s):` document (`docContext`). Frames, sandboxed documents, the editor's preview and the dev server's preview show the Live's address as text instead; when in doubt it does not connect.
- The exported file must carry exactly one CSP `<meta>` whose `connect-src` is exactly the endpoint in both `https://` and `wss://` forms (`connectSrc`, `cspOk`; `kit/core/live.mjs` refuses a file that already has a CSP). The WebSocket URL is built only on the same origin as the endpoint (`socketUrl`, `sameEndpoint`).
- Reconnection stops outside the live time (`plan` returns `window_over`) and on the server's stop codes, with back-off and jitter.
- The join code is not stored in the lesson (`validate` rejects `live.key` there); it goes only into the exported copy. In the join link it sits after `#`, so it is not sent to the server as part of the address (`joinUrl`).

**Not covered.** Anyone holding the exported copy has the join code and can join during the live time; **Change join code** locks out copies that leaked. Content sent to the Live (questions, poll answers) goes to the Live server you chose; its protection is that of [egatari/live](https://github.com/egatari/live), not of this repository.

## 4. Colab TTS

**Threat.** Script text leaves the machine for Google's environment, and the returned audio ZIP file is data from outside.

**What is in place** (docs/editor.md, "Make AI voice in the cloud (Google Colab)"; `kit/core/colab-core.mjs`).
- The editor asks once before export, because in Colab the script text is processed in Google's environment and the model files come from Hugging Face. `tts-job.json` holds only the text to read, voice names, each step's `inputHash`, the `docId` and the target recipe.
- The returned ZIP file is untrusted. It is read as bytes with limits checked before allocation (ZIP file 512 MiB, 64 MiB per audio file, `records.json` 4 MiB, at most 400 steps), and zip64, encryption and unknown compression are refused. Only `records.json` and `audio/<name>.wav` are read, names are checked, the audio must decode as a WAV of the recorded length, and nothing is interpreted as HTML or code. The editor recomputes each `inputHash` from the current script instead of trusting the notebook, and refuses a ZIP file made for another lesson (`docId`).
- The notebook link is pinned to a release tag.

**Not covered.** What Google or Hugging Face do with the text and the model files. The Colab check is verified only for the one environment named in the docs.

## 5. Supply chain

**Threat.** A malicious or vulnerable dependency, part or workflow action reaches users or the release.

**What is in place.**
- Runtime dependencies are few and pinned to exact versions in `package.json`, with `package-lock.json` installed by `npm ci --ignore-scripts` in CI: no dependency's install script runs (the only one, esbuild's `postinstall`, is not needed; SECURITY.md lists it and the Colab exception).
- Dependabot waits 7 days (14 for a major version) before proposing a new release (`cooldown` in `.github/dependabot.yml`); security updates are not delayed.
- CI runs a patched Node (at least 22.23.4 / 24.22.1, the 2026-10-20/21 security release), not whatever version the runner has cached (SECURITY.md).
- Registry parts are vendored copies of [egatari/components](https://github.com/egatari/components) releases. `npm run components:update` checks the tarball and every file against the release's `manifest.json` (SHA-256), never replaces a version it already has; the build never fetches parts, and `npm run components:check` (part of `gen:check`) compares `vendor/components` with `components.lock.json`. Yanked versions (v1.0.0 and v1.0.1) are built only with a warning, and never silently.
- The editor page loads its MP3 encoder only from its own site. The browser-TTS window (`lab/tts-helper.html`) loads pinned libraries from jsDelivr and the model from Hugging Face; it is same-origin with the editor and trusted as the lab page is, so a compromised file there could reach the editor's storage (SECURITY.md).
- GitHub workflows: every workflow declares least-privilege `permissions:`. CodeQL (`codeql.yml`), `npm audit --omit=dev --audit-level=high` (`audit.yml`), OpenSSF Scorecard (`scorecard.yml`) and Dependabot for npm and GitHub Actions (`.github/dependabot.yml`) watch the code and its dependencies. They report; they do not block a release by themselves.
- Release builds of the editor site are checked against the sha256 recorded in the release notes before older copies are assembled (`tools/site-versions.mjs`, RELEASING.md).

**Not covered.** Dev dependencies are not audited by CI. Actions are pinned to version tags, not commit hashes, so a moved tag would be picked up until Dependabot or review notices. Packages that Dependabot proposes still need a human to read them.

## Reporting

See [SECURITY.md](../SECURITY.md#reporting-a-vulnerability).
