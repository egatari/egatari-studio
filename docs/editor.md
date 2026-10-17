# Editor app (no install)

English | [日本語](editor.ja.md)

A web page that opens a deck folder directly and does what the [dev server](dev-server.md) does: preview, edit the source and the narration on the slide, and leave comments for Claude. It also opens a [portable file](reference.md#portable-file---portable) (one HTML file that carries its source, following the [portable deck format](https://github.com/egatari/egatari-spec)) without any folder, edits it in memory and saves it again. There is nothing to install and no terminal to use.

- **Browsers:** Google Chrome or Microsoft Edge on a computer (Windows, macOS, Linux, ChromeOS). Folders use the File System Access API (`showDirectoryPicker`), which Safari and Firefox do not have; on other browsers the first screen says so. A portable file can be opened and edited in any current browser; without the file pickers, saving downloads the file.
- **Network:** none, apart from loading the editor itself. The deck folder or file is read and written in the browser and is never uploaded.

## Getting the editor

| Form | How | Notes |
|---|---|---|
| Hosted | <https://moiku.github.io/motion-academic-slides/editor/> | Published from `main` by `.github/workflows/pages.yml`. Loads only the font files a deck needs |
| One file | `npm run build:app`, then double-click `dist/editor.html` | About 10 MB: all font files are inside. Works from `file://` in Chrome and Edge; you can copy the file to anyone |
| Your own server | `npm run build:app`, then serve `dist/editor/` as static files | Any static host (https, or `http://localhost`) |

`npm run build:app` (`node tools/build-app.mjs [--out dist] [--no-single]`) needs `npm ci` first (it uses esbuild, a pinned dev dependency).

## Using it

1. **Open a deck.** Drop the deck folder (the folder with `deck.html`; if there is no `deck.html`, the first `.html` file at the top of the folder) onto the page, or press 「フォルダを開く」 / "Open folder". The browser asks once whether the page may edit that folder.
   - **New deck** makes `deck.html` and `narration.md` from the same template as `npm run new` (title, language, theme). Choose an empty folder to use it as is; if the folder is not empty, a new folder named after the title is made inside it.
   - **Recent folders** are listed on the first screen (the browser keeps the folder handles in IndexedDB; the contents are not stored). When you reopen one, the browser asks for permission again.
2. **Edit.** The keys are the same as the dev server (and the toolbar has buttons for them):

   | Key | Action |
   |---|---|
   | `e` | edit mode; **double-click** an outlined element to open its source (HTML, with math as `\( … \)`), ⌘/Ctrl+Enter to save |
   | `n` | narration drawer for the step on screen (speaker, add / delete / reorder turns) |
   | Alt+click (Mac: ⌥ Option+click) | leave a comment for Claude about that element (`comments.json`) |
   | `c` | list of open comments; click one to go to its slide, “Resolve” to mark it done |

   As with the dev server, a save is refused if the file changed since the preview was built (the source hash or the narration revision does not match); reload and try again.
3. **Work with Claude Code.** Keep the editor open while Claude Code (or any editor) changes the folder. The editor looks at the files about every 1.5 s; when one changes it rebuilds and reloads the preview on the same slide and step. If you are typing in an editor card or the narration drawer, the reload waits until you save or cancel. If the build fails, the error is shown over the preview until the file is fixed.
4. **Present and share.** Use the toolbar:
   - **Quick check:** a subset of `npm run check` that runs in the preview (overflow, font size, title / conclusion length, missing narration, palette contrast). Click a result to go to the slide. It is a hint, not the full check: there are no component determinism, timeline, morph or accessibility checks, and the numbers can differ slightly from the command-line check because the window differs.
   - **Export HTML:** builds the deck without the editing hooks and saves it as one HTML file (asks where to save). Double-click the file to present it anywhere.
   - **Print / PDF:** the browser's print dialog for the deck (one page per slide with the final state of each, as with `tools/pdf.mjs`; choose “Save as PDF” and turn on “Background graphics”).
   - **Presenter view** (or `p` in the deck): a window with the current slide, the next step, the narration as speaker notes, a timer and the drawing tools. It controls the preview in the editor window.
   - **Fullscreen:** the preview fills the screen (for the projector).

## Portable files (no folder)

A portable file is what `npm run build -- <deck.html> --portable` (or “Export portable file” in the editor) writes. It plays like any built deck, and it carries the deck's source and audio, so the editor can work on it without the original folder.

- **Open.** Press **Open file…** (on the first screen or in the toolbar), or drop the file onto the first screen. The editor reads the file as bytes and extracts it in a Web Worker with an HTML parser that runs no scripts; the file itself is never loaded as a page, so nothing in it runs during import. Every hash, size limit and path rule of the format is checked first, exactly as `npm run portable -- unpack` does. The source then lives in memory (an in-memory folder); the preview, the editing tools and the quick check work on it as on a folder. Outside changes are not watched (there is no folder).
- **Save.** **Save** writes the same file again when the browser gave a writable handle (Open file… or drag and drop in Chrome / Edge; the browser may ask for permission the first time). Otherwise it asks where to save, or downloads the file when there is no save dialog (Safari, Firefox). **Save as…** always asks. The saved file is rebuilt from the edited source with the editor's bundled kit, components and themes, so it plays exactly like the preview. The document id (`docId`), the license, copyright, attribution and creators, unknown index members and extension data are kept; audio is copied byte for byte. A dot (●) before the file name means there are unsaved changes; leaving the page or opening another file asks first.
- **Stale audio.** Editing a step's narration does not touch its audio: the step is listed as stale in the warnings (and in the saved file, its audio record still carries the old narration hash). To make new audio, export a folder and run TTS on the command line.
- **Export folder…** writes the source, the audio and `audio/manifest.json` to an empty folder you choose (the same files as `npm run portable -- unpack`); a folder that is not empty is refused. The folder then opens, builds and packs like any deck folder.
- **Export portable file** (for an open folder) writes the folder as a portable file. The first time, a lesson id is written to the folder's settings file so that later exports keep it.
- **Not saved into the file:** comments for Claude and the backups in `.cache/edits/` stay in memory only (comments are review notes; the format leaves them out).

### Rights prompt

Before the first edit of an opened file (the first save from edit mode or the narration drawer, or pressing Edit / Narration), the editor shows the lesson's title, creators, copyright, license and attribution as written in the file (they are claims; nothing verifies them). If the license does not permit derivatives (a Creative Commons `-ND` license, or “All rights reserved”), or there is a copyright notice but no license, it warns that modifying or sharing a modified copy may infringe the rights holder's copyright, and editing starts only after you tick the confirmation. Cancel leaves the file unchanged. Saving never removes the copyright, attribution or creators.

### Files the editor refuses or opens read-only

- **Refused, with the reason:** a file that is not a portable file or is play-only, a broken hash or a missing part, a path that is not allowed (e.g. `../`), a duplicate member in the index, a document id that disagrees with the settings file, a feature it does not implement (listed as required), and a newer source contract.
- **Newer major version:** not opened for editing; the dialog offers **Export folder…** to extract the source (checked with the rules of the version the editor knows).
- **Read-only:** a different runtime contract, or registry components or themes whose hash differs from the editor's (or that the editor does not have). The deck is shown, Save is refused, and Export folder… works.
- **Its own code:** a file with scripts or components of its own (the “extended” profile) opens with the notice “This file contains its own code; it can modify the file while you edit. Open only files you trust.” (see the known limitation below).

## Files it writes

Exactly the same as the dev server ([dev-server.md#files-it-rewrites](dev-server.md#files-it-rewrites)), all inside the chosen folder:

- `deck.html`: only the contents of the element you edited
- `narration.md`: only the lines of the step you edited (comments and other lines stay)
- `comments.json`: comments for Claude, `[{id, created, key, range, quote, comment, status}]`
- `.cache/edits/`: the previous `deck.html` / `narration.md` before each change (the newest 30)
- with “New deck”: `deck.html` and `narration.md`; with “Export HTML” and “Export portable file”: the file you chose (and, the first time, the lesson id in the settings file of the folder)
- with an opened portable file: nothing until you save (edits are in memory); then only the file you chose, or the files in the empty folder of “Export folder…”

## Limits

- **Chrome / Edge only.** Mobile browsers cannot open folders either.
- **Command line only:** narration audio (TTS), video and bundles (`tts/`, `render/`), the full check (`npm run check`), `tools/pdf.mjs`. Audio in the folder (`audio/`) is ignored: autoplay uses the default timing, as without audio.
- **Bigger exports.** The command-line build can subset the Japanese font with fonttools (`node tools/get-fonts.mjs`); the browser cannot, so the editor embeds the matching font files whole (as the command line does without the TTF files). `examples/minimal` is about 2.0 MB from the editor and 0.7 MB from `npm run build` with subsetting. The deck looks the same.
- **Bundled parts.** Components (`components/`), themes (`themes/`) and the runtime (`kit/`) of the repository are the ones bundled when the editor was built. Components and themes inside the deck folder (`components/<name>/index.js`, `themes/<name>/`) are read from the folder as usual.
- **Not read:** names starting with `.`, and the `out/`, `audio/`, `video/`, `bundle/` and `node_modules/` folders (up to 3000 files, 10 levels deep). `audio/` is read only to export a portable file.
- **Portable files are rebuilt when saved.** The editor does not yet patch only the changed narration and audio in place; it builds the whole file again with its bundled kit (so a file made by an older or newer build changes outside the edited parts, and fonts are embedded whole). It does not yet compare every slide before and after.
- **Network in the deck is blocked.** External images and scripts (`https://…`) do not load in the editor's preview; the build warns about them anyway.

## How it works and security

- **One build for both.** `kit/core/build-core.mjs` is the build (annotation, includes, KaTeX, components, narration, marks, timing, themes, assets, fonts) with no Node dependency; it reads files only through an interface it is given. `kit/build.mjs` passes Node's file system (plus fonttools subsetting and ffmpeg); the editor passes the chosen folder and the bundled kit, components, themes, KaTeX and fonts. With font subsetting off, both produce byte-identical HTML (`tools/test-app.mjs` checks this for `examples/minimal` and `examples/tmlr2026-calibration`). The narration parser and the narration rewriting (`kit/core/narration-core.mjs`) and the new-deck template (`kit/templates/new-deck.mjs`) are shared the same way.
- **One editing UI for both.** `server/client.js` talks to a transport: `fetch` and Server-Sent Events with the dev server, `postMessage` to the editor in the app. The editor answers the same requests (`/__dev/source`, `/__dev/edit`, `/__dev/narration`, `/__dev/comment`, …) against the folder (`app/devapi.js`).
- **The deck runs in a sandbox.** The preview is an `<iframe sandbox="allow-scripts allow-modals">` without `allow-same-origin`, so the deck has an opaque origin: it cannot reach the editor page, its storage or the folder handles, and it can only send messages, which the editor checks (source window, request shape) and answers only for the open folder. `allow-modals` is there for `confirm` (discarding narration changes) and printing. The page's Content-Security-Policy (inherited by the deck) allows loading only the editor itself (`'unsafe-eval'` is allowed because components build formulas with `new Function`, e.g. `m-sweep f="…"`). The presenter view is a window the editor opens, with the deck again in a sandboxed iframe; the editor relays its messages.
- **The editor touches only the folder or file you chose**, and only after the browser's permission prompt.
- **Opening a portable file runs nothing from it.** The file is read as bytes and parsed in a Web Worker (bundled into the editor; the page's policy allows workers only from `blob:`) with scripting disabled; the editor never navigates to it or inserts it into a page. Only the deck rebuilt from its source runs, in the same sandboxed preview as a folder.
- **Known limitation (until v0.3): the deck's own code can edit the deck.** The editing UI runs inside the sandboxed deck, and the editor checks only that a request comes from the preview. So a script or component in the deck can send edit requests and rewrite `deck.html`, `narration.md` and `comments.json` of the open folder or file (nothing else; backups stay in `.cache/edits/`). The rights prompt still comes first, from the editor itself, and a read-only file refuses every write. Open only decks you trust; portable files with their own code show a notice. In v0.3 the editing UI moves into the editor itself and the preview can only point at what to edit.

## Publishing on GitHub Pages

`.github/workflows/pages.yml` builds `dist/` with `node tools/build-app.mjs --out _site` and deploys it to GitHub Pages: the editor at `/editor/`, the single file at `/editor.html`. It does nothing until Pages is set up:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: add `EDITOR_PAGES` = `true` (without it, pushes skip the deploy, so the workflow does not fail before Pages is enabled).
3. Run the workflow once (Actions → pages → Run workflow), or push to `main`.

## Tests

`node tools/test-app.mjs [work folder] [--shots folder]` (part of `npm test`) builds the editor into the work folder, serves it on 127.0.0.1, creates deck folders in the browser's origin-private file system (OPFS) and opens them through `window.__APP_TEST_OPEN(handle)`. It checks the byte-identical builds, editing, the narration drawer, comments, outside changes, build errors, quick check, export, presenter view, the English UI and the single file from `file://`, and that there are no console errors. For portable files it builds one from `examples/minimal` (with dry-run audio) and the document fixtures of `tools/portable-fixtures.mjs`, and checks opening, the rights prompt (and the confirmation for a no-derivatives license), editing text and narration, saving to a file handle in OPFS, reopening (same `docId`, unchanged audio hashes, the unpacked folder equals the in-memory one), Export folder and Export portable file (byte-identical), the notice for files with their own code, that the canary script never runs in the editor page or the reader worker, the refusals (path traversal, future major version, duplicate member, unknown required feature), read-only files, and the download fallback. `node tools/test-workspace.mjs` tests the in-memory folder and the rights rules without a browser.

## Language

The editor follows your browser language (Japanese or English). Switch with the **English / 日本語** button at the top right, or open `…/editor/?lang=en` or `?lang=ja`. The choice is remembered; switching while a deck is open reopens the same folder (an opened portable file is closed; unsaved changes are asked about first). The editing tools inside the slide (edit mode, narration drawer) follow the deck's own language (`<html lang>`).
