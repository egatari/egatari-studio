<!-- i18n: pair=viewer.ja.md sha256=6a63ab94ae6b9ac5 -->
# Egatari Viewer

English | [日本語](viewer.ja.md)

Egatari Viewer is a web app that opens an [Egatari](https://github.com/egatari/egatari-spec) file (.ega.html) on the viewer's device and plays it. It is meant to live at `https://viewer.egatari.org/`; added to the Home Screen it is called **Ega Viewer**, with the え icon (the Egatari mark; Egatari Studio's own icon is す). **It is not deployed yet** (see [Deploying](#deploying-for-the-maintainer)).

For people handing out lessons: [Opening a lesson on iPhone and iPad (Egatari Viewer)](viewer-sharing.md).

It exists because a single file cannot always be opened as a web page:

- iPhone and iPad cannot open a local HTML file from the Files app;
- some Android file apps hand the browser a `content://` address that does not work well;
- chat apps (Slack and others) fail to preview large files.

The viewer chooses the file in the page (or shares it to the installed app on Android). The file is read in the page and is never uploaded.

## Using it

- **Open a file**: the 「ファイルを開く」 (Open a file) button, or drop a file on the page. Only Egatari files play: a page whose `deck-meta` is not an Egatari one is refused. The bar shows the lesson's title and whether it is an 「Egatari ファイル（編集可）」 (editable: an Egatari file with its archive layer) or an 「Egatari ファイル（再生専用）」 (play-only). Both play the same; editing is done in Egatari Studio.
- **Recent files**: files you open are kept in the browser, under the notice 「この端末にだけ保存されます」 (stored on this device only), in OPFS (the origin private file system) or, where a page cannot write OPFS (older Safari), in IndexedDB. Up to 10 files; each can be deleted, or all at once; the checkbox 「開いたファイルを最近の一覧に残す」 turns keeping off. **「共有の端末」 (Shared device)** is for a device several people use, such as a school iPad: it turns keeping off and deletes the files already kept, and the choice is remembered on the device. It is off by default (`SHARED_DEVICE_DEFAULT` in `play/main.js`, one constant to flip). Nothing is uploaded anywhere.
- **Install**: the page is a web app (manifest and service worker; `name` "Egatari Viewer", `short_name` "Ega Viewer", and `apple-mobile-web-app-title` for iOS). On Android and desktop Chrome, install it from the browser menu; on iPhone and iPad, Share → Add to Home Screen. Once it has been opened, it opens offline. iOS and iPadOS have no install prompt, so on iPhone and iPad, in a browser tab (not from the Home Screen), the start screen shows one line with iOS's own labels (Safari: Share → "View More" → "Add to Home Screen" → "Add"; checked on an iPad on 2026-10-27) until it is dismissed with × (remembered on the device). In Chrome on iOS (CriOS) the steps are Share → "View More" → "Add to Home Screen" with "Open as Web App" left on (that makes it standalone and offline; checked on an iPad on 2026-10-27). On Android, when the browser fires `beforeinstallprompt`, the line carries an Install button that calls `prompt()`; it hides after installing and when running standalone. A PC shows neither: there the .ega.html plays in the browser itself.
- **Share to it (Android)**: the installed app is a share target. Share an .ega.html from the Files app or a chat app and choose Egatari Viewer.
- **Language**: Japanese first; the 「English」 button switches (remembered on this device).

## How the lesson is kept apart

A lesson is untrusted HTML with scripts (spec §11). The page plays it as a host would (spec §10.1):

- The lesson runs in an `<iframe sandbox="allow-scripts">` whose document is `srcdoc`: no `allow-same-origin`, `allow-popups`, `allow-forms`, `allow-modals`, `allow-downloads` or `allow-top-navigation`. Its origin is opaque, so it cannot read this page's OPFS, IndexedDB, localStorage or cookies, or reach its DOM. It cannot open windows or navigate the page.
- The document is the page's **trusted prefix** followed by the file's bytes unchanged (`app/preview-doc.js`, the same as Studio's preview). The prefix carries the preview policy (`connect-src 'none'`, `frame-src 'none'`, only `data:` and `blob:` resources), so it is in force before any byte of the lesson is parsed. The page never searches the lesson's markup for a place to insert anything. The prefix also holds the page's small shim (`play/lesson-shim.js`): it sets `?embed=1` (spec §9.4) and hands links that leave the lesson to the page.
- A `srcdoc` document also inherits the page's own policy; both apply. That is why the page's policy allows inline scripts and styles (lessons need them) while the page itself uses none: its own scripts are files, and everything it shows from a file or a service (titles, file names, Live text, link addresses) is set as text, never as markup. The policy is otherwise as tight as it gets, and `tools/test-play.mjs` checks it exactly: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src data: blob:; connect-src 'self' https://live.egatari.org wss://live.egatari.org; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (`connect-src 'self'` is for the service worker's install; `form-action 'none'` because an Android share is a POST from the system, not a form in the page). **A follow-up idea:** serve the lesson frame from its own path (e.g. `/frame`) with a header CSP and fill it by message instead of `srcdoc`; the page would then no longer inherit into the lesson and could drop `'unsafe-inline'`. The page's `connect-src` lists its Live endpoints, and the lesson's prefix narrows that to `'none'`, so only the page can reach a Live room.
- **The file's own CSP `<meta>`** (written into play-only files that carry a Live room, live §2.4; from format 1.0 on, into every file, format spec §4.2) lands inside the lesson's `<head>` after the prefix and is enforced as well: the browser applies every policy, so the lesson gets the narrowest of the three. Its `connect-src` (the Live endpoint) has no effect inside the frame. **The `deck-extensions` block** is data: the page reads it itself with a parser that runs nothing (`play/scan.mjs`, parse5 under limits), and the lesson's own Live client (`kit/live.js`) sees that it is framed and does not connect (live §2.1). Because the page shows Live in its own chrome, it hides the lesson's Live mark and pane with a rule in the prefix (they could only say "you cannot join from here").  `tools/test-play.mjs` plays a copy of a fixture that carries the §4.2 baseline (`connect-src 'none'` and the `liveCsp` shape) and checks that a fetch from the lesson is reported against both the file's policy and the prefix's.
- Messages from the frame are untrusted requests: the page accepts them only from that frame (`event.source`), only with an opaque origin (`"null"`), and only in these shapes: a position event (spec §9.4 `position`, or the player's older `deck-pos`), and the link request `{egatari: "openLink", href, text, download?}` (spec §9.4: exactly those members, `text` at most 200 characters, `download` only as `true`, sent for a link with a `download` attribute). Anything else is ignored. The shim sends `openLink` only on the viewer's own activation (a trusted click while the frame has a transient activation); clicks made by lesson script send nothing. Lesson code can still post the message itself, so the page treats it as untrusted: it applies §11 and never opens anything without a tap in its own box. (Studio's editor preview has no such message: there the player shows the destination without a way to open it, §11 (g).)

## Links

Links the lesson asks the page to open go through the player's own rule, `kit/core/link-policy.mjs` (spec §11). The box is in the page, outside the frame, so the lesson cannot draw over it. It shows the destination's host and address; it refuses every scheme but `https:`, `http:`, `mailto:` and `tel:`; it confirms every time when the text names another host, the destination is not plain `https:`, the link downloads, the address has a user name or password, or the host is punycode. A file next to the lesson (a relative link) cannot be reached from this page and is refused with that reason. A link that would save a file (`download: true`) is refused too: the box shows its host and 「この教材からはファイルを保存できません」 (Files can't be saved from this lesson), and nothing opens. Opening is an ordinary link with `noopener noreferrer` that the viewer taps. A plain `https:` host agreed to once is remembered in memory for the session (§11 (f)); the next link to it shows a plain box with the host name and 「開く」 (Open), without the warning. One tap is still needed: the page never opens a link on a message alone, and Safari does not let a page open a tab without a tap in that page. One box shows at a time, and for 1.5 s after it closes new requests are ignored, so a lesson cannot keep the box up.

## Live

When a lesson carries a valid `extensions.live` with a key (a play-only file exported "with a live room"), the page acts for the lesson (live §2A): it shows the 「ライブ」 button and pane in its own chrome and holds the WebSocket itself.

- **Join first.** A lesson with Live opens on a start screen: 「参加する」 (Join) with the window and the destination host, and 「参加しないで見る」 (Watch without joining). The lesson's frame is placed only after one of them, so the Join tap can never meet the frame. Watching without joining makes no request at all; Join stays available in the Live controls. For an endpoint the page does not connect to, the start screen offers the room's join page link instead of Join.
- No request before the viewer presses Join, and none outside the window. Only what an activity needs is sent: questions, votes, a name if the viewer types one, a random id made on this device, and pings. Text from the room is shown as text. Retries follow `LivePolicy.plan` (`kit/core/live-policy.mjs`).
- The page learns the current step from the lesson's position events, to show that step's poll; a step with a poll is announced.
- **Layout** (`play/layout.mjs`), chosen once when the lesson starts, from its activities and the screen, and kept while it plays (only a rotation, or a desktop window resize, lays it out again):

  | Lesson | Phone portrait | Phone landscape | Wide screen |
  |---|---|---|---|
  | No Live | the lesson fills the page | same | same |
  | Live without polls | a 44 px bar below the lesson: indicator, 「退出する」 (Leave) or Join | the side slack (below) | the 44 px bar |
  | Live with polls | the pane below the 16:9 stage (the poll first) | the side slack (below) | the 340 px side pane |

  In phone landscape (height up to 500 px) the page's bar is hidden and the stage fills the height. With at least 120 px of side slack (19.5:9 phones: about 150 px) the controls take a column there: close, indicator, Leave or Join, and 「投票」 (Poll), which shows the poll in the column. Without slack (16:9 phones) the variant is one constant, `NO_SLACK_VARIANT` in `play/main.js`. **'overlay'** (the default, the owner's choice) keeps the full screen for the slide and lays a 28 px indicator over the frame's top edge, shown from the moment the frame is placed; the poll opens as a sheet over the frame. **'strip'** (the alternative) shrinks the stage by 28 px and gives the controls a strip above it; the poll replaces the strip's content as one row. `?noslack=strip` or `?noslack=overlay` switches it for measuring.
- **Why the layout is fixed.** In one line: lost taps come from page chrome that switches from hidden to shown over the out-of-process frame. The lesson's frame runs in its own process, and Chrome hands a tap to it by hit-test data from the last frame shown. A control that had just appeared where the lesson was (a pane shown over the frame, or a frame that just shrank) lost its first tap to the lesson in 12 of 45 fast taps under load. With Join before the frame, and controls placed before the frame and never moved, `tools/play-tap-measure.mjs` (3 copies at once, 15 sessions each, taps as soon as a control is visible) counted no lost tap: Join 0/45, the poll in portrait 0/90, in landscape with slack 0/135, without slack 0/225 for both the strip and the overlay variant, the first tap after a rotation 0/45, Leave 0/45. The overlay is safe only because its indicator is always shown over the frame and never toggled over it (see the comment at `NO_SLACK_VARIANT`); any change to that must be measured again. The slide is 375 × 211 px in portrait (375 × 667), 693 × 390 in landscape at 844 × 390, 617 × 347 (strip) or 667 × 375 (overlay) at 667 × 375, and 940 × 529 at 1280 × 800 with the side pane.
- **Touch targets.** Each poll choice's whole row is the target: 44 px tall in the panes, the slack column and the overlay's sheet, and at least 24 × 24 px (WCAG 2.2) in the 28 px strip; the same for 戻る, 投票する, 退出する, 投票 and ×. At those sizes the poll fits in the slack column (choices wrap) and in the strip (one row), so no other layer is needed. Measured again with the row as the target and the overlay as the default: the overlay 0/225, the strip 0/225, the slack column 0/135.
- The 「ライブ」 button (portrait and wide screens) moves the focus into the Live controls; Escape returns it.
- **Keys.** The navigation keys (← → ↑ ↓, Space, PageUp/PageDown, Home/End) move the lesson wherever the focus is. The page focuses the frame when the lesson has loaded (Chrome loses the focus given to the frame's first, empty document; Safari may refuse it), and a navigation key pressed while the focus is in the page (its bar, a button, the Live pane) is handed to the lesson as `{egaViewer: "key", key, shift}`; the page's lesson shim presses it the way the player's own buttons do (a keydown on the lesson's document), so it works with any player inside the file. Not handed over: keys in a field or a widget that uses the arrows, keys while the link box is open, and Space on a button or link (it presses it). Measured by `tools/viewer-keys-check.mjs` in Chromium (`test-play`) and WebKit (`test-viewer-webkit`, Desktop Safari).
- **Offline.** Join on a device with no network (`navigator.onLine` false) does not retry: it says at once 「この端末はネットワークにつながっていません。Wi-Fi などにつないでから、「もう一度試す」を押してください。参加しなくても教材は見られます」, and 「もう一度試す」 joins once the device is online. Every message that reports a failure ends with what to do next.
- The page connects only to endpoints that its own policy allows (the build's `--live-endpoint`, by default `https://live.egatari.org`). For any other endpoint it shows the room's join page link (`/join#room=…&key=…`, the key after `#`), which opens in a new tab.
- **Nothing from Live is relayed into the lesson.** v1 relays one thing out of it, the step on screen. Not yet: drawing a region on the slide for a question (the lesson's frame has no way to hand strokes to the page yet).
- The teacher's own editable file has `extensions.live` without a key: it plays, without Live.

## Service worker, offline and versions

The service worker (`play/sw.js`) caches only the page's own files, listed by the build, under a cache named by the version (the package version and a hash of the files): the app shell, which is the page, its script, the reader Worker, the style sheet, `guard.js`, the manifest and the icons (the page uses the system fonts and loads no font file). It never stores anything else: not a lesson, not a shared file. Once the Viewer has been opened, it opens with no network, from the Home Screen as well; lessons are read on the device and never uploaded anywhere, online or not.

**Updates apply on the next launch.** A new version installs beside the running one and waits; there is no update button. It takes over only when the Viewer is launched: when no window of it is open the browser activates it by itself, and a page freshly launched at its start screen (no lesson open) asks the waiting worker to take over and reloads once. The worker agrees only when that page is the Viewer's only window (`activate-if-idle`), so a lesson playing in another window is never swapped. An update found more than 10 s after a launch, or while a lesson plays, waits for the next launch; returning to the Viewer at its start screen counts as a launch. Nothing is requested while a lesson plays (the page checks for updates only at a launch).

`tools/test-play.mjs` checks: the cache holds exactly the app shell; offline, a navigation and a reload open the Viewer with its logo, manifest and icons, and a lesson plays, with no request reaching the server; a version found while a lesson plays waits (same version, same slide, no reload), also when a second window is launched; after every window is closed the next launch runs the new version and only its cache remains; no lesson bytes appear in any request or WebSocket frame, with or without Live.

## Touch

The lesson's own player (`kit/tools.js`) takes touch itself, so the page adds nothing for it: a tap on the slide wakes the toolbar (前へ, 次へ, 字幕, 読み上げで聞く …), a tap that wakes it does not press a button under it (`REVEAL_GUARD`, 350 ms), the bar is shown for 5 seconds when the lesson opens, and a small handle brings it back when it is hidden. The lesson shim (`play/lesson-shim.js`) only sets the embedding mode and hands links out of the lesson to the page. `tools/test-viewer-webkit.mjs` checks the bar, captions and read-aloud in Playwright's WebKit with iPad sizes.

## Building

```sh
node tools/build-play.mjs [--out _play] [--live-endpoint https://live.example.org …]
```

writes `_play/` (not committed): `index.html`, `guard.js`, `play.css`, `play.js` (bundled with esbuild from `play/main.js`, importing `kit/core/link-policy.mjs`, `kit/core/live-policy.mjs`, `kit/core/bounded-html.mjs` and `app/preview-doc.js`: the player is not forked), `reader.js` (the Worker that scans a file), `sw.js`, `manifest.webmanifest` (icons 192 and 512 px from `assets/logo`, and `share_target`), `icons/` and `_headers`. `--live-endpoint` (repeatable) replaces the default list of rooms the page may connect to; the same list goes into the page's `connect-src`.

Test: `node tools/test-play.mjs <work dir>` (part of `npm test`). It builds into the work dir and serves it with a small server that applies `_headers` the way Cloudflare does, and uses `tools/live-fake-server.mjs` as the Live room.

To try it locally: `node tools/build-play.mjs && npx wrangler@4.124.0 dev -c play/wrangler.toml` (wrangler is not a dependency of this repository; `npx` fetches that version, the one egatari/live pins).

## Hosting: Cloudflare Workers static assets

The page is static files with response headers. It is hosted as **Cloudflare Workers static assets** (`play/wrangler.toml`, `play/wrangler.production.toml`, `play/worker.js`), not Pages:

- Workers is where Cloudflare is putting new static sites, and the Live service (egatari/live) is already a Worker: one tool (wrangler), one way to configure and deploy, and the same split between a development config and a production config.
- Static assets read `_headers`, which carries the policy and the frame refusal for every file, so the files are served without running code.
- A small Worker answers only what matches no file: an Android share (`POST /share`) that arrives before the service worker is installed. It cannot receive the file (nothing is uploaded) and sends the page a 303 to `/?share=nosw`, which asks the viewer to open the app once and share again.
- A custom domain (`routes = [{ pattern = "viewer.egatari.org", custom_domain = true }]`) makes `wrangler deploy` create the DNS record and certificate itself.

The page refuses to run in a frame: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on every file, and `guard.js` checks `window.top` before anything else runs (defense in depth).

## Deploying (for the maintainer)

Not done yet. Every deploy needs the owner's approval.

1. `npm ci && npm test` on the commit to deploy (or at least `node tools/test-play.mjs`).
2. `node tools/build-play.mjs` (production: no `--dev-loopback`; the default Live endpoint `https://live.egatari.org`).
3. Sign in if needed: `npx wrangler@4.124.0 login`. The `egatari.org` zone must be in the same Cloudflare account.
4. `CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler@4.124.0 deploy -c play/wrangler.production.toml`. This creates (or updates) the Worker `egatari-viewer`; with `custom_domain = true` it also creates the DNS record and certificate for `viewer.egatari.org`. The account id is passed at deploy time, never committed.
5. Check: `curl -sI https://viewer.egatari.org/` shows the `Content-Security-Policy` with `frame-ancestors 'none'` and `X-Frame-Options: DENY`; open the page, open a lesson, and install it on a phone.

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
