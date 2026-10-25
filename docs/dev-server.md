<!-- i18n: pair=dev-server.ja.md sha256=8a8e8b6369d3efc3 -->
# Dev server (fix the slides in the browser)

English | [日本語](dev-server.ja.md)

A small server for fixing the text and the script in the browser, and for leaving comments for the AI (what to change), without opening the slides' HTML by hand.
The list of options, endpoints and keys is in [reference.md#dev-server](reference.md#dev-server).
You do not need VS Code. It listens on 127.0.0.1 only.
To do the same without Node, use the [editor app](editor.md) (Chrome / Edge).

## Starting

```bash
node server/dev.mjs examples/minimal/deck.html            # http://127.0.0.1:8730/
npm run dev -- path/to/deck.html --port 5174 --theme business
```

It watches the working folder (deck.html, narration.md, timeline.json, macros.tex, data/, figs/, components/, audio/manifest.json)
the repository's kit/, vendor/components/ and themes/, and your theme folders (EGATARI_THEMES, ~/.egatari/themes) (a folder of the lesson that is a symbolic link is not watched; the server warns once). When something changes it rebuilds and reloads the page (staying on the same slide and step).
When the build fails, the error is shown on the page. Fix it and save, and the slides come back.
`?presenter=1`, `?mode=lecture` and the like work as usual. Audio is read from `/deck/audio/…`.

The page at `/` is a frame around the slides: the slides themselves run in a sandboxed iframe (`/preview`), and the editing tools (the HTML box, the script drawer, the comment box and the list) belong to the frame page, not to the slides. The slides only point at what you want to edit; the frame page reads the HTML, shows it and writes it when you press Save (see [Protection](#protection)).

## Controls

| Key | Action |
|---|---|
| `e` | Toggle edit mode. Editable elements get an outline. **Double-click** to open the HTML (with math as `\( \)`) in the side panel of the frame page (never over the slide), ⌘/Ctrl+Enter or Save to save, Esc to cancel. While the HTML or comment box is open the slides do not take clicks |
| `n` | Script drawer (right; the slide shrinks beside it). Edit the turns of the current step (speaker Expert / Novice; add, delete and reorder turns). Write `{cue}` and `{φ\|ファイ}` as they are. The next step is shown below |
| `c` | List of comments for the AI (open ones), numbered. Click one to go to its slide and step; its point flashes on the slide. 「解決」 ("Resolve") marks it as done |
| Alt+click (on a Mac, hold the ⌥ Option key and click) | Leave a comment for the AI about that element. The point you clicked is kept too (a *pin*): while the list is open, each comment of the step on screen is marked with a numbered ring at that spot, at any size of the slide |
| `m` (in edit mode, when not typing in a text field; also the 「マーカー（m）」 / "Marker (m)" button in the edit-mode bar of the side panel, and the pen button of the slide controls, which reads 「マーカー」 / "Marker" with the key `m` while editing; `d` also opens it) | Marker: draw a circle or an arrow on the slide. When you let go, the same comment box as Alt+click opens for the mark in the side panel; while it is open, further strokes join the same comment (up to 20; the preview stays drawable), Leave keeps all the marks with the comment (`strokes`), Cancel discards them all. The marks are drawn over the slide (never into the slides' HTML) in the pin colour. The indicator says 「編集中：マーカー」 / "Editing: marker". `m` again (or `d`), or Esc, turns it off, and so does leaving edit mode. While typing in a text field `d` and `m` are text. Outside edit mode `m` does nothing and `d` is the presenter pen; the presenter view cannot choose the marker and its tools stay refused while editing |

The keys work whether the focus is on the slide or on the frame page; the box or drawer that opens takes the focus, and closing it gives the focus back to the slide.

All editing tools (the edit-mode bar, the HTML box, the comment box and list, the script drawer) live in one side panel next to the slides, under an orange bar **編集中 — 開発サーバー** (“Editing — dev server”). **Anything inside the slide area can be drawn by the slides' HTML; trust only controls in the side panel under that bar.**
**Edit mode and the presenting tools do not mix.** Entering edit mode turns off the laser pointer, pen and fading pen (ink already drawn stays visible but cannot be drawn on), stops autoplay and its audio, and closes the slide overview, the black screen, the key list (?), fullscreen and a half-typed slide number. Lecture and captions stay as they are. While editing, the tool buttons (autoplay, laser pointer, fading pen, colors, clear, overview, fullscreen) are hidden from the control bar and their keys (`x` `v` Shift+`d` Backspace `o` `a` `b` `f`) do nothing; the pen button stays, relabelled **マーカー** / **Marker** with the same icon, and it and the pen key `d` toggle the marker instead of the pen (see the table above); a tool chosen in the presenter view is turned off again. Leaving edit mode brings none of them back. Keys typed into a text field (the HTML box, or an input inside the slides) are always text, never tool or slide keys. The current mode (**編集中** / **Editing**, **発表の道具：ペン** / **Presenter tool: Pen**, **表示** / **Viewing**) is shown in a thin bar below the slides, never over them, and announced to screen readers.
The presenting keys (arrows, Space, p, a, l, …) work as usual outside input fields. `p` opens the presenter view in a window of its own (the slides run sandboxed there too).
Your input stays when the slides reload (after a save or an outside change), so you can keep typing; if the same element or step changed in the meantime, the save is refused.
If the HTML has changed elsewhere by the time you save (the hash does not match), it does not save and shows 「スライドが変わっています。再読み込みしてください」 ("The slides have changed. Please reload.")
The same goes for the script: if the lines of that step have changed elsewhere since the drawer was opened, it does not save and shows 「台本が変わっています」 ("The script has changed"; your input is kept).

## Files it rewrites

- `deck.html`: replaces only the contents of the element edited by double-click
- `narration.md`: replaces only the lines of that step (`[k] …` and its continuation lines). If there are none, they are added at the position given by the order of slides and steps.
  All other lines (including comments) stay as they were. Deleting all turns removes the lines of that step
- `comments.json`: comments for the AI, `[{id, created, key, range, pin, quote, comment, status}]` (key is `slideKey:step`, range is the position in deck.html, pin is the clicked point `{x, y}` in slide coordinates, 1280×720, independent of the zoom; older comments without `pin` still work; a marker comment adds `strokes`, the drawn marks as lists of points `[[[x, y], …], …]` in the same coordinates (older comments may have a single `stroke`, read as one mark), and its `pin` is the centroid of all marks: [contract §13](contract.md#13-review-notes-the-ink-stroke)). The point refers to the final state of the step (`DECK.seek(i, k, Infinity)`), also when you clicked during its animation. quote begins with the text near the point when there is any (a label or word inside a figure or part, at most 60 characters), followed by the first 80 characters of the element
- `.cache/edits/`: copies of deck.html and narration.md from before each rewrite (the latest 30)

## Protection

**The slides' HTML cannot write.** Scripts and parts in it run, but only inside the sandboxed iframe:

- The slides' document (`/preview`) is served in an `<iframe sandbox="allow-scripts allow-modals">` without `allow-same-origin`, so it has an opaque origin. It cannot read the frame page, its storage or the token, and every request it could send carries `Origin: null`.
- The slides' document has its own Content-Security-Policy: `connect-src 'none'` (no `fetch`, XHR, beacons or event streams), images, fonts and styles only from `data:` / `blob:` (the build embeds them), audio only from `/deck/audio/`, frames only from the exact endpoint `/preview` (the presenter view's inner views), no forms and no `<base>`. The policy also carries a `sandbox` directive.
- The slides' document is served only into the frame page's iframe. The frame page (and the presenter window) loads `/preview?cap=…` with a capability issued with that page, and the server also requires the browser's `Sec-Fetch-Dest: iframe`, which page scripts cannot set. Opened directly in a tab, where no frame page's `frame-src` applies and a navigation could carry data out in its URL, `/preview` (even with a capability) returns a short text page that runs nothing (403, `Content-Security-Policy: sandbox; default-src 'none'`).
- Files of the working folder under `/deck/…` never run as documents: every response carries `Content-Security-Policy: sandbox; default-src 'none'` and `X-Content-Type-Options: nosniff`. Audio, video, images and fonts keep their type; everything else (HTML, SVG, XML, scripts, text) is served as `text/plain` or `application/octet-stream` with `Content-Disposition: attachment`. Neither the slides' document nor the frame page may frame anything but `/preview`.
- The slides' HTML only sends **hints** to the frame page: “edit the element with this `data-src` range and hash”, “a comment at this element”, the keys `e` / `n` / `c` / Esc, and its position. A hint carries no text to write. The frame page checks the shape of each hint, reads the current HTML itself, checks the range and the hash, and shows its own card or drawer; it writes only when you press Save (or ⌘/Ctrl+Enter) in that card or drawer. Hints with forged text are ignored; a hint can at most open a card showing the real HTML. The point of a comment hint is checked like the rest: numbers only (anything else means no pin), clamped to the slide, rounded to 0.1, other fields dropped, near text at most 60 characters; the server checks it again (`kit/core/comment-core.mjs`). The slides' HTML can forge a point, but that only moves the marker: the comment itself is typed in the frame page and written only when you press Leave. The markers over the slide are drawn by the frame page (without taking clicks), placed from the iframe's own size; the slides' HTML tells it nothing about where they go.
- The token exists only in the frame page, never in the slides' document.
- The editing tools are drawn only outside the slide area, in the frame page's side panel with its orange marker bar; the slides' HTML cannot draw outside its frame. While you edit in a trusted field (an HTML or comment box is open, or you are typing in the script drawer or it has unsaved changes), the slides' iframe is `inert`, so the slides' HTML cannot catch the clicks or keys meant for the field. Meanwhile the frame page still receives the slides' position, but hints from the slides' HTML neither open, close nor switch panels, and the script step you are editing does not change; when you leave the script fields without unsaved changes, the drawer follows the slide again. The slides' HTML can still draw a fake card inside the slide area (it cannot save anything); trust only the side panel.

So that a browser that has another site open cannot rewrite your slides and script, the following are refused as well.

- Requests whose Host is not `127.0.0.1:port` or `localhost:port` (against DNS rebinding) get 403
- The `/__dev/` endpoints (writing, reading the HTML, comments, `/__dev/info`, `/__dev/events`) need a token created at every start.
  It is embedded only in the frame page (`/`), and the frame page sends it as `X-Deck-Token` (for `/__dev/events`, `?token=`).
  A wrong token gets 403 (after restarting the server, reload the page)
- Requests with `Origin: null` (what the sandboxed slides would send) or with `Sec-Fetch-Site` other than `same-origin` get 403, even with the right token
- Writes (POST) get 415 unless `Content-Type: application/json`, and 403 if an Origin is present and is not 127.0.0.1 or localhost on the same port
- A text edit must name an element that the current build marked as editable (`data-src`) and whose HTML still has the same hash; a script edit must name a slide of the lesson and the current revision of that step. Otherwise 409 (or 400)
- The frame page cannot be put in a frame by another page (`frame-ancestors 'none'`)
- `/deck/…` does not serve names starting with a dot (the copies in `.cache/edits/`, `.env`, and so on). Symlinks pointing outside the working folder also get 403
- Malformed URLs (such as `/%ZZ`) get 400
- Writes and backups never go through a symbolic link: if `deck.html`, `narration.md`, `comments.json`, `.cache` or `.cache/edits` is a link (also one pointing inside the folder, or a dangling one), the save is refused with 403 and nothing is written or deleted. Files are written to a temporary file in the same folder and renamed over the old one; backup cleanup deletes only backup-named regular files. `narration.md` and `comments.json` are read only if their real path is inside the working folder ([format spec](https://github.com/egatari/egatari-spec) §11), only if they are regular files and within fixed limits (`deck.html` 32 MiB, `narration.md` 16 MiB, `comments.json` 4 MiB, checked from the opened file's size before reading and from the bytes read): a larger file is refused with 413 without being read, and a save that would make one larger is refused with 413 without writing (no backup either). Files under `/deck/…` are streamed only up to the size seen by `stat`
- After you press Save in the script drawer, typing again before the server answers keeps the drawer unsaved (the newer text stays, the drawer does not follow the slides, the preview stays inert) until you save again

`tools/test-dev-server.mjs` checks this with slides that try to write (`tools/hostile-deck.mjs`: a part and an inline script that send the old write messages with forged text, read the token, reach for the frame page, and `fetch` / XHR / beacon the write endpoints with and without a guessed token): nothing in the folder changes until Save is pressed in the frame page.

## Asking an AI coding tool

Ask your AI coding tool (Claude Code, Codex, Gemini CLI …) to "apply the comments in comments.json" (with the motion-slides skill installed in Claude Code, "Apply the comments" is enough). The tool reads the entries with `status: "open"` in `comments.json`, uses `key`, `quote` and `range` as clues
to edit deck.html (or narration.md, or a part), and sets the finished ones to `"status": "resolved"`.
range is the position at the time the comment was left, so if it has shifted, the tool searches for quote. For a marker comment (`strokes`), the drawn marks are what the comment refers to (inside the circle, at the arrow's head); `npm run comment-shots` draws it on the images. If the server is running, the result appears on the page as soon as it is saved.

To see what a comment points at, the tool should first run

```bash
npm run comment-shots -- <working folder>      # node tools/comment-shots.mjs <working folder> [id …] [--all]
```

It builds the slides, renders each open comment's step headlessly (`DECK.seek(i, k, Infinity)`, the same picture every time), draws the pin (and a marker comment's strokes, in the same colour) and writes into `<deck>/.cache/comment-shots/` (ignored by git): `<id>.png` (480×300 of the slide around the pin at 2×, widened to the bounding box of all strokes plus 48 px when there are strokes; the whole slide when there is no pin), `<id>-full.png` (the whole slide, 1280×720) and `index.json`. No image comes from the preview.
