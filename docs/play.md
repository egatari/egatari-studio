<!-- i18n: pair=play.ja.md sha256=1816cf4a73b779f5 -->
# Egatari Play (the player page)

English | [日本語](play.ja.md)

Egatari Play is a web page that opens an [Egatari](https://github.com/egatari/egatari-spec) single file (.ega.html) on the viewer's device and plays it. It is meant to live at `https://play.egatari.org/`. **It is not deployed yet** (see [Deploying](#deploying-for-the-maintainer)).

It exists because a single file cannot always be opened as a web page:

- iPhone and iPad cannot open a local HTML file from the Files app;
- some Android file apps hand the browser a `content://` address that does not work well;
- chat apps (Slack and others) fail to preview large files.

The viewer chooses the file in the page (or shares it to the installed app on Android). The file is read in the page and is never uploaded.

## Using it

- **Open a file**: the 「ファイルを開く」 (Open a file) button, or drop a file on the page. Only Egatari files play: a page whose `deck-meta` is not an Egatari one is refused. The bar shows the lesson's title and whether it is an 「Egatari ファイル（編集可）」 (editable: a portable file with its archive layer) or an 「Egatari ファイル（再生のみ）」 (play-only). Both play the same; editing is done in Egatari Studio.
- **Recent files**: files you open are kept in the browser, under the notice 「この端末にだけ保存されます」 (stored on this device only), in OPFS (the origin private file system) or, where a page cannot write OPFS (older Safari), in IndexedDB. Up to 10 files; each can be deleted, or all at once; the checkbox 「開いたファイルを最近の一覧に残す」 turns keeping off. Nothing is sent anywhere.
- **Install**: the page is a web app (manifest and service worker). On Android and desktop Chrome, install it from the browser menu; on iPhone and iPad, Share → Add to Home Screen. Once installed it opens offline.
- **Share to it (Android)**: the installed app is a share target. Share an .ega.html from the Files app or a chat app and choose Egatari Play.
- **Language**: Japanese first; the 「English」 button switches (remembered on this device).

## How the lesson is kept apart

A lesson is untrusted HTML with scripts (spec §11). The page plays it as a host would (spec §10.1):

- The lesson runs in an `<iframe sandbox="allow-scripts">` whose document is `srcdoc`: no `allow-same-origin`, `allow-popups`, `allow-forms`, `allow-modals`, `allow-downloads` or `allow-top-navigation`. Its origin is opaque, so it cannot read this page's OPFS, IndexedDB, localStorage or cookies, or reach its DOM. It cannot open windows or navigate the page.
- The document is the page's **trusted prefix** followed by the file's bytes unchanged (`app/preview-doc.js`, the same as Studio's preview). The prefix carries the preview policy (`connect-src 'none'`, `frame-src 'none'`, only `data:` and `blob:` resources), so it is in force before any byte of the lesson is parsed. The page never searches the lesson's markup for a place to insert anything. The prefix also holds the page's small shim (`play/lesson-shim.js`): it sets `?embed=1` (spec §9.4) and hands links that leave the lesson to the page.
- A `srcdoc` document also inherits the page's own policy; both apply. That is why the page's policy allows inline scripts and styles (lessons need them) while the page itself uses none: its own scripts are files. The page's `connect-src` lists its Live endpoints, and the lesson's prefix narrows that to `'none'`, so only the page can reach a Live room.
- **The play-only file's own CSP `<meta>`** (written into files that carry a Live room, live §2.4) lands inside the lesson's `<head>` after the prefix and is enforced as well: the browser applies every policy, so the lesson gets the narrowest of the three. Its `connect-src` (the Live endpoint) has no effect inside the frame. **The `deck-extensions` block** is data: the page reads it itself with a parser that runs nothing (`play/scan.mjs`, parse5 under limits), and the lesson's own Live client (`kit/live.js`) sees that it is framed and does not connect (live §2.1). Because the page shows Live in its own chrome, it hides the lesson's Live mark and pane with a rule in the prefix (they could only say "you cannot join from here").
- Messages from the frame are untrusted requests: the page accepts them only from that frame (`event.source`), only with an opaque origin (`"null"`), and only in three shapes: a position event (spec §9.4 `position`, or the player's older `deck-pos`), and the shim's link request. Anything else is ignored.

## Links

Links the lesson asks the page to open go through the player's own rule, `kit/core/link-policy.mjs` (spec §11). The box is in the page, outside the frame, so the lesson cannot draw over it. It shows the destination's host and address; it refuses every scheme but `https:`, `http:`, `mailto:` and `tel:`; it confirms every time when the text names another host, the destination is not plain `https:`, the link downloads, the address has a user name or password, or the host is punycode. A file next to the lesson (a relative link) cannot be reached from this page and is refused with that reason. Opening is an ordinary link with `noopener noreferrer` that the viewer taps. A plain `https:` host agreed to once is remembered in memory for the session; it then opens at once when the browser still counts the viewer's tap in the frame, and otherwise the box asks with one tap (Safari does not let a page open a tab without a tap in that page). One box shows at a time, and for 1.5 s after it closes new requests are ignored, so a lesson cannot keep the box up.

## Live

When a lesson carries a valid `extensions.live` with a key (a play-only file exported "with a live room"), the page acts for the lesson (live §2A): it shows the 「ライブ」 button and pane in its own chrome and holds the WebSocket itself.

- No request before the viewer presses 「参加する」 (Join), and none outside the window. The pane shows the destination host before joining. Only what an activity needs is sent: questions, votes, a name if the viewer types one, a random id made on this device, and pings. Text from the room is shown as text. Retries follow `LivePolicy.plan` (`kit/core/live-policy.mjs`).
- The page learns the current step from the lesson's position events, to show that step's poll; a step with a poll opens the pane.
- The page connects only to endpoints that its own policy allows (the build's `--live-endpoint`, by default `https://live.egatari.org`). For any other endpoint it shows the room's join page link (`/join#room=…&key=…`, the key after `#`), which opens in a new tab.
- **Nothing is relayed into the lesson.** v1 relays one thing out of it, the step on screen. Not yet: drawing a region on the slide for a question (the lesson's frame has no way to hand strokes to the page yet).
- The teacher's own editable file has `extensions.live` without a key: it plays, without Live.

## Service worker and versions

The service worker (`play/sw.js`) caches only the page's own files, listed by the build, under a cache named by the version (the package version and a hash of the files). It never stores anything else: not a lesson, not a shared file. A new version installs beside the old one and waits; the page shows 「新しい版があります」 and switches only when the viewer presses 「更新する」. If a lesson is open, it asks first.

## Building

```sh
node tools/build-play.mjs [--out _play] [--live-endpoint https://live.example.org …]
```

writes `_play/` (not committed): `index.html`, `guard.js`, `play.css`, `play.js` (bundled with esbuild from `play/main.js`, importing `kit/core/link-policy.mjs`, `kit/core/live-policy.mjs`, `kit/core/bounded-html.mjs` and `app/preview-doc.js`: the player is not forked), `reader.js` (the Worker that scans a file), `sw.js`, `manifest.webmanifest` (icons 192 and 512 px from `assets/logo`, and `share_target`), `icons/` and `_headers`. `--live-endpoint` (repeatable) replaces the default list of rooms the page may connect to; the same list goes into the page's `connect-src`.

Test: `node tools/test-play.mjs <work dir>` (part of `npm test`). It builds into the work dir and serves it with a small server that applies `_headers` the way Cloudflare does, and uses `tools/live-fake-server.mjs` as the Live room.

To try it locally: `node tools/build-play.mjs && npx wrangler dev -c play/wrangler.toml` (wrangler is not a dependency of this repository; `npx` fetches it).

## Hosting: Cloudflare Workers static assets

The page is static files with response headers. It is hosted as **Cloudflare Workers static assets** (`play/wrangler.toml`, `play/wrangler.production.toml`, `play/worker.js`), not Pages:

- Workers is where Cloudflare is putting new static sites, and the Live service (egatari/live) is already a Worker: one tool (wrangler), one way to configure and deploy, and the same split between a development config and a production config.
- Static assets read `_headers`, which carries the policy and the frame refusal for every file, so the files are served without running code.
- A small Worker answers only what matches no file: an Android share (`POST /share`) that arrives before the service worker is installed. It cannot receive the file (nothing is uploaded) and sends the page a 303 to `/?share=nosw`, which asks the viewer to open the app once and share again.
- A custom domain (`routes = [{ pattern = "play.egatari.org", custom_domain = true }]`) makes `wrangler deploy` create the DNS record and certificate itself.

The page refuses to run in a frame: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on every file, and `guard.js` checks `window.top` before anything else runs (defense in depth).

## Deploying (for the maintainer)

Not done yet. Production is frozen until at least 2026-10-23 15:00, and every deploy needs the owner's approval.

1. `npm ci && npm test` on the commit to deploy (or at least `node tools/test-play.mjs`).
2. `node tools/build-play.mjs` (production: no `--dev-loopback`; the default Live endpoint `https://live.egatari.org`).
3. Sign in if needed: `npx wrangler login`. The `egatari.org` zone must be in the same Cloudflare account.
4. `CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler deploy -c play/wrangler.production.toml`. With `custom_domain = true` this creates the DNS record and certificate for `play.egatari.org`. The account id is passed at deploy time, never committed.
5. Check: `curl -sI https://play.egatari.org/` shows the `Content-Security-Policy` with `frame-ancestors 'none'` and `X-Frame-Options: DENY`; open the page, open a lesson, and install it on a phone.

## Self-hosting

You may serve the same files from your own origin. Requirements:

- **A host that can send response headers.** Send the headers in `_headers` for every file: the `Content-Security-Policy` (with `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and the others listed there. Cloudflare (Workers or Pages) and Netlify read `_headers` as it is; with nginx, Caddy or Apache, copy the lines into the server's configuration. Do not use GitHub Pages or any host that cannot send headers: such a host cannot refuse to be framed, and the page's policy then comes only from the browser's defaults.
- **HTTPS** (a service worker and OPFS need a secure context).
- **Its own origin**, separate from any editor (live §2A.4): not the origin of an Egatari Studio you also host, so that lessons played there can never reach the editor's storage.
- **`POST /share`** answered with `303 See Other` to `/?share=nosw` (what `play/worker.js` does), or the share target only works after the app has been opened once.
- **Live rooms**: build with `--live-endpoint <your room service>` for each room service the page may connect to; lessons with other endpoints get the join link only.

## Not in v1

- An iOS wrapper app (later).
- Regions drawn on the slide with a question, through the page.
- Printing and saving attachments from the lesson (the frame has no `allow-modals` and no `allow-downloads`); the page's own fullscreen control.
- Opening files directly from the operating system (`file_handlers`, desktop).
