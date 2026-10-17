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

## Controls

| Key | Action |
|---|---|
| `e` | Toggle edit mode. Editable elements get an outline. **Double-click** to open the source (HTML, with math as `\( \)`), ⌘/Ctrl+Enter to save, Esc to cancel |
| `n` | Narration drawer (right). Edit the turns of the current step (speaker Expert / Novice; add, delete and reorder turns). Write `{cue}` and `{φ\|ファイ}` as they are. The next step is shown below |
| `c` | List of instructions for Claude (open ones). Click one to go to its slide; 「解決」 ("Resolve") marks it as done |
| Alt+click (on a Mac, hold the ⌥ Option key and click) | Leave an instruction for Claude about that element |

The presenting keys (arrows, Space, p, a, l, …) work as usual outside input fields.
If the source has changed elsewhere by the time you save (the hash does not match), it does not save and shows 「原稿が変わっています。再読み込みしてください」 ("The source has changed. Please reload.")
The same goes for the narration: if the lines of that step have changed elsewhere since the drawer was opened, it does not save and shows 「口述原稿が変わっています」 ("The narration has changed"; your input is kept).

## Files it rewrites

- `deck.html`: replaces only the contents of the element edited by double-click
- `narration.md`: replaces only the lines of that step (`[k] …` and its continuation lines). If there are none, they are added at the position given by the order of slides and steps.
  All other lines (including comments) stay as they were. Deleting all turns removes the lines of that step
- `comments.json`: instructions for Claude, `[{id, created, key, range, quote, comment, status}]` (key is `slideKey:step`, range is the position in deck.html)
- `.cache/edits/`: copies of deck.html and narration.md from before each rewrite (the latest 30)

## Protection

So that a browser that has another site open cannot rewrite your source, the following are refused.

- Requests whose Host is not `127.0.0.1:port` or `localhost:port` (against DNS rebinding) get 403
- The `/__dev/` endpoints (writing, reading the source, comments, `/__dev/events`) need a token created at every start.
  It is embedded in the served page as `window.__DECK_DEV_TOKEN`, and client.js sends it as `X-Deck-Token` (for `/__dev/events`, `?token=`).
  A wrong token gets 403 (after restarting the server, reload the page)
- Writes (POST) get 415 unless `Content-Type: application/json`, and 403 if an Origin is present and is not 127.0.0.1 or localhost on the same port
- `/deck/…` does not serve names starting with a dot (the copies in `.cache/edits/`, `.env`, and so on). Symlinks pointing outside the deck folder also get 403
- Malformed URLs (such as `/%ZZ`) get 400

These protect against other sites, not against the deck itself: the token is visible to every script in the served page, so code in the deck (an inline script or a component) can send the same edit requests as the editing UI and rewrite `deck.html`, `narration.md` and `comments.json`. Serve only decks you trust. v0.3 moves the editing UI out of the deck page.

## Asking Claude Code

Ask "Apply the comments." Claude Code reads the entries with `status: "open"` in `comments.json`, uses `key`, `quote` and `range` as clues
to edit deck.html (or narration.md, or a component), and sets the finished ones to `"status": "resolved"`.
range is the position at the time the instruction was left, so if it has shifted, Claude Code searches for quote. If the server is running, the result appears on the page as soon as it is saved.
