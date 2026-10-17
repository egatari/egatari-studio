# Dev server (fix the deck in the browser)

English | [日本語](dev-server.ja.md)

A small server for fixing the text and the narration in the browser, and for leaving instructions for Claude, without opening the HTML source by hand.
The list of options, endpoints and keys is in [reference.md#dev-server](reference.md#dev-server).
You do not need VS Code. It listens on 127.0.0.1 only.
To do the same without Node, use the [editor app](editor.md) (Chrome / Edge).

## Starting

```bash
node server/dev.mjs examples/minimal/deck.html            # http://127.0.0.1:8730/
npm run dev -- path/to/deck.html --port 5174 --theme tml
```

It watches the deck folder (deck.html, narration.md, timeline.json, macros.tex, data/, figs/, components/, audio/manifest.json)
and the repository's kit/, components/ and themes/. When something changes it rebuilds and reloads the page (staying on the same slide and step).
When the build fails, the error is shown on the page. Fix it and save, and the deck comes back.
`?presenter=1`, `?mode=lecture` and the like work as usual. Audio is read from `/deck/audio/…`.

The page at `/` is a frame around the deck: the deck itself runs in a sandboxed iframe (`/preview`), and the editing tools (the source card, the narration drawer, the comment box and the list) belong to the frame page, not to the deck. The deck only points at what you want to edit; the frame page reads the source, shows it and writes it when you press Save (see [Protection](#protection)).

## Controls

| Key | Action |
|---|---|
| `e` | Toggle edit mode. Editable elements get an outline. **Double-click** to open the source (HTML, with math as `\( \)`) in a card next to the element, ⌘/Ctrl+Enter or Save to save, Esc to cancel |
| `n` | Narration drawer (right; the slide shrinks beside it). Edit the turns of the current step (speaker Expert / Novice; add, delete and reorder turns). Write `{cue}` and `{φ\|ファイ}` as they are. The next step is shown below |
| `c` | List of instructions for Claude (open ones). Click one to go to its slide; 「解決」 ("Resolve") marks it as done |
| Alt+click (on a Mac, hold the ⌥ Option key and click) | Leave an instruction for Claude about that element |

The keys work whether the focus is on the slide or on the frame page; the card or drawer that opens takes the focus, and closing it gives the focus back to the slide.
The presenting keys (arrows, Space, p, a, l, …) work as usual outside input fields. `p` opens the presenter view in a window of its own (the deck runs sandboxed there too).
Your input stays when the deck reloads (after a save or an outside change), so you can keep typing; if the same element or step changed in the meantime, the save is refused.
If the source has changed elsewhere by the time you save (the hash does not match), it does not save and shows 「原稿が変わっています。再読み込みしてください」 ("The source has changed. Please reload.")
The same goes for the narration: if the lines of that step have changed elsewhere since the drawer was opened, it does not save and shows 「口述原稿が変わっています」 ("The narration has changed"; your input is kept).

## Files it rewrites

- `deck.html`: replaces only the contents of the element edited by double-click
- `narration.md`: replaces only the lines of that step (`[k] …` and its continuation lines). If there are none, they are added at the position given by the order of slides and steps.
  All other lines (including comments) stay as they were. Deleting all turns removes the lines of that step
- `comments.json`: instructions for Claude, `[{id, created, key, range, quote, comment, status}]` (key is `slideKey:step`, range is the position in deck.html)
- `.cache/edits/`: copies of deck.html and narration.md from before each rewrite (the latest 30)

## Protection

**The deck cannot write.** Scripts and components in the deck run, but only inside the sandboxed iframe:

- The deck document (`/preview`) is served in an `<iframe sandbox="allow-scripts allow-modals">` without `allow-same-origin`, so it has an opaque origin. It cannot read the frame page, its storage or the token, and every request it could send carries `Origin: null`.
- The deck document has its own Content-Security-Policy: `connect-src 'none'` (no `fetch`, XHR, beacons or event streams), images, fonts and styles only from `data:` / `blob:` (the build embeds them), audio only from `/deck/audio/`, frames only from the exact endpoint `/preview` (the presenter view's inner views), no forms and no `<base>`. The policy also carries a `sandbox` directive, so the deck document has an opaque origin even when opened directly in a tab.
- Files of the deck folder under `/deck/…` never run as documents: every response carries `Content-Security-Policy: sandbox; default-src 'none'` and `X-Content-Type-Options: nosniff`. Audio, video, images and fonts keep their type; everything else (HTML, SVG, XML, scripts, text) is served as `text/plain` or `application/octet-stream` with `Content-Disposition: attachment`. Neither the deck nor the frame page may frame anything but `/preview`.
- The deck only sends **hints** to the frame page: “edit the element with this `data-src` range and hash”, “a note at this element”, the keys `e` / `n` / `c` / Esc, and its position. A hint carries no text to write. The frame page checks the shape of each hint, reads the current source itself, checks the range and the hash, and shows its own card or drawer; it writes only when you press Save (or ⌘/Ctrl+Enter) in that card or drawer. Hints with forged text are ignored; a hint can at most open a card showing the real source.
- The token exists only in the frame page, never in the deck document.

So that a browser that has another site open cannot rewrite your source, the following are refused as well.

- Requests whose Host is not `127.0.0.1:port` or `localhost:port` (against DNS rebinding) get 403
- The `/__dev/` endpoints (writing, reading the source, comments, `/__dev/info`, `/__dev/events`) need a token created at every start.
  It is embedded only in the frame page (`/`), and the frame page sends it as `X-Deck-Token` (for `/__dev/events`, `?token=`).
  A wrong token gets 403 (after restarting the server, reload the page)
- Requests with `Origin: null` (what the sandboxed deck would send) or with `Sec-Fetch-Site` other than `same-origin` get 403, even with the right token
- Writes (POST) get 415 unless `Content-Type: application/json`, and 403 if an Origin is present and is not 127.0.0.1 or localhost on the same port
- A text edit must name an element that the current build marked as editable (`data-src`) and whose source still has the same hash; a narration edit must name a slide of the deck and the current revision of that step. Otherwise 409 (or 400)
- The frame page cannot be put in a frame by another page (`frame-ancestors 'none'`)
- `/deck/…` does not serve names starting with a dot (the copies in `.cache/edits/`, `.env`, and so on). Symlinks pointing outside the deck folder also get 403
- Malformed URLs (such as `/%ZZ`) get 400

`tools/test-dev-server.mjs` checks this with a deck that tries to write (`tools/hostile-deck.mjs`: a component and an inline script that send the old write messages with forged text, read the token, reach for the frame page, and `fetch` / XHR / beacon the write endpoints with and without a guessed token): nothing in the folder changes until Save is pressed in the frame page.

## Asking Claude Code

Ask "Apply the comments." Claude Code reads the entries with `status: "open"` in `comments.json`, uses `key`, `quote` and `range` as clues
to edit deck.html (or narration.md, or a component), and sets the finished ones to `"status": "resolved"`.
range is the position at the time the instruction was left, so if it has shifted, Claude Code searches for quote. If the server is running, the result appears on the page as soon as it is saved.
