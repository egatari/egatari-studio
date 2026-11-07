<!-- i18n: pair=privacy.ja.md sha256=dd595e5f8aa60217 -->
# Privacy

English | [日本語](privacy.ja.md)

## About this page

This page is written by us, the developers of Egatari, and explains what Egatari Studio (the app for making lessons, https://studio.egatari.org/) and the player that plays lessons (Egatari Player) send over the internet, and what they store on which device.

- It covers Studio, the `.ega.html` files Studio exports (the files handed out to learners), and Egatari Viewer, the play-only page (https://viewer.egatari.org/).
- It describes what the code actually does. We have not added ads or usage tracking.
- It also says how to block or check each connection, for school IT staff.
- Live: an optional feature, chosen by the creator for each lesson and open for a set time, where participants send questions and votes from their own devices to a Live server during a lesson or talk; lessons without Live never connect to a Live server.
- The evidence in the code (files and lines) is in the [appendix](#appendix-evidence-in-the-code-for-maintainers).

## Where the lesson files are

- A lesson is a folder on the creator's computer or a single file (`.ega.html`). Studio does not send lessons to any server.
- The Studio page runs under a policy that forbids connecting to other servers (CSP `connect-src 'self'`). It connects only to the Studio site itself.
- Backups made during editing are stored in `.cache/edits/` inside the folder the creator chose, up to 30 files.
- Only when using Google Colab does the creator export the script text and hand it to Colab themselves (see the table).

## What is sent over the internet

"Automatic" means it happens without pressing anything. "On click" means it happens only when the creator or a participant presses something.

| When | Sent to | What is sent | How to stop it |
|---|---|---|---|
| Opening the Studio page (automatic) | studio.egatari.org (served by GitHub Pages). The interface, fonts and the version list (`versions.json`) come from the same site | The same as loading any web page (IP address, browser type and so on). For what GitHub and Cloudflare, which host the site, keep, see "Site logs" below | The offline editor (save `editor.html` and open it) does not fetch the version list |
| Making AI voice "on this computer" (on click; a confirmation the first time) | Where the model and libraries are served from: cdn.jsdelivr.net, huggingface.co, us.aws.cdn.hf.co (Hugging Face's download host). Runs in a separate small window. The code it loads is pinned to a version and checked against its expected content before it runs (from v0.6.6) | Download requests only. The script text and the lesson are not sent. Speech is generated on the creator's computer's GPU | Cancel in the confirmation. Nothing is downloaded if it is not used. The models can be deleted from the "How to use" panel |
| Making AI voice in Google Colab (on click; a confirmation the first time) | The creator exports `tts-job.json` and chooses it in Colab. Colab is a Google service | `tts-job.json`: the script text (after the reading dictionary), voice names, the lesson title (up to 120 characters), the lesson ID and the version. No slides or other files. If the creator chooses their own reference voice for voice cloning, that also goes to Colab | Don't use "Make in the cloud". Record, or use "This computer" |
| Inside Colab (Colab does this itself) | GitHub (Studio's code), PyPI and npm (libraries), Hugging Face and GitHub releases (models) | Download requests, inside Google's servers | Same as above |
| Pressing "Send feedback" (on click) | github.com/egatari/egatari-studio/issues/new (opens in a new window; nothing is sent until the person who pressed it submits the form) | Fields filled in in advance: version, browser name and major version, OS type, language, mode. No lesson content | Don't press it. Export the `.ega.html` with `data-feedback="off"` and the button is not shown |
| Following links such as the guide or the parts gallery (on click) | github.com, studio.egatari.org, a Live host page and so on | The same as any link (what the destination server receives) | Don't follow the link |
| Using Live (questions and polls) (participant's action; press "Join" once) | The Live server written in the lesson (by default https://live.egatari.org; the lesson's creator can choose another) | Questions and votes the participant chooses to send, a name only if they type one, a random ID made on the device, pings to keep the connection, and the join code (from v0.6.6, sent in the first message after connecting, not in the connection address). The viewing position and timing are not sent | Export without Live. Block only that server on the school network |

Notes:
- Analytics: we have not added analytics code to Studio or the player. For the access logs that GitHub and Cloudflare, which host the sites, keep, see "Site logs" below.
- Only the window that downloads the voice models loads scripts from other servers (pinned by version and content). The main Studio page does not.

## What is not sent

Studio and the player do not send the following.

- Studio never sends lesson slides, scripts, audio or images to a Studio server. The server has no service for saving or sharing lessons.
- Studio's preview runs under a policy that cannot connect anywhere (`connect-src 'none'`).
- Read-aloud (the browser's speech) uses only voices installed on the device. Network voices are not chosen.
- Recording is processed on the device. The microphone is used only when the record button is pressed.
- An `.ega.html` sends nothing over the internet unless it has a Live (see below).
- A learner's viewing position and progress are never sent to an Egatari server. Only when the file is opened inside an LMS or embedded in another page are they passed to that page (see below).

## What is stored on devices

All of it is stored only in the browser and is not sent anywhere. Clearing the browser's site data removes it. It is stored on one of two devices: the creator's device (the computer running Studio), or the device of the person who opens the lesson (learners and participants).

### The creator's device (Studio)

| Where | Name (key) | What | How to remove |
|---|---|---|---|
| localStorage (Studio) | `motion-editor-lang` | The chosen language (ja / en) | Clear site data |
| localStorage (Studio) | `egatari-colab-privacy-ok` | That the creator confirmed "the script goes to Google" | Same |
| localStorage (Studio) | `egatari-rec-keep-recording` | A recording setting (one on/off switch) | Same |
| localStorage (Studio) | `egatari-slides-open` | Whether the slide list was open | Same |
| localStorage (Studio) | `egatari-studio-live-results-notice` | That the note about importing Live results was shown | Same |
| sessionStorage (Studio) | `motion-editor-reopen` | A mark to reopen the lesson right after changing the language (gone when the tab is closed) | Close the tab |
| IndexedDB (Studio) | `motion-slides-editor` | "Handles" to recently opened lesson folders and files (markers pointing to their location; up to 8). The lesson contents are not stored | Clear site data |
| IndexedDB (Studio) | `egatari-theme-folder` | The handle of the theme folder. "My themes" (`my:<name>`) are stored together with the theme files' contents | "Delete" in the "My themes" window, or clear site data |
| Cache Storage (Studio's AI voice window) | `irodori-lab-<version>`, `transformers-cache` | The AI voice models (about 1.3 GB for Japanese, about 330 MB for English) | "Delete models" in the "How to use" panel |
| In the creator's folder | `.cache/edits/` | Backups before edits (up to 30) | Delete them from the folder |

### The device of the person who opens the lesson (learners and participants; the player and Egatari Viewer)

| Where | Name (key) | What | How to remove |
|---|---|---|---|
| localStorage (the `.ega.html` player) | `deck-capsize` | Caption size (S / M / L) | Clear site data |
| localStorage (the `.ega.html` player) | `<format>-player-bar-hint-v1` | That the controls hint was shown | Same |
| localStorage (the `.ega.html` player) | `<format>-player-progress:<lesson>` | Progress per lesson (which steps were played or read, and whether it was finished) | Same |
| localStorage (the `.ega.html` player) | `<format>-player-resume:<lesson>` | The place reached in each lesson, for "Resumed where you left off" (slide, step, place in the book pane) | Same |
| localStorage (the `.ega.html` player) | `<format>-player-layout:<lesson>`, `<format>-player-split`, `<format>-player-read-size` / `-read-lh` / `-read-bg` | The chosen layout, the divider position, and the book pane's text size, line spacing and background | Same |
| localStorage / sessionStorage (an `.ega.html` with Live) | `egatari-live-pid:<Live ID>`, `egatari-live-joined:<Live ID>` | A random ID made on the device, and whether the participant joined (the joined mark lasts only while the tab is open) | Clear site data, or close the tab |
| Egatari Viewer: OPFS (IndexedDB if not available) | `recent/`, database `egatari-viewer` | Copies of recently opened lesson files (up to 10), on that device only | "Delete" in the list, "Delete all", or tick the "Shared device" checkbox |
| Egatari Viewer: localStorage | `egatari-viewer-keep`, `egatari-viewer-shared`, `egatari-viewer-lang`, `egatari-viewer-install-hint` | Whether to store copies, whether it is a shared device, the language, whether the install hint was closed | Clear site data |
| Egatari Viewer: Cache Storage | `egatari-viewer-<version>` | The Viewer's own files (so it opens offline). No lesson files | Clear site data |

Notes:
- While playing, the address after `#` is rewritten to the current place (the slide ID and the step). For "Resumed where you left off", the place reached in each lesson is stored on the device of the person who opened the lesson (see the table above). Not when embedded, inside an LMS, or in Studio's preview.
- By default, Egatari Viewer stores copies of recently opened lessons. Ticking "Shared device" stores no copies and deletes the existing ones. On devices shared at a school, please ask people to tick it.

## Files handed out to learners (the player)

- An exported `.ega.html` carries a policy that forbids connecting to other servers (CSP `connect-src 'none'`). Images, sounds and fonts come only from inside the file.
- Only a file with Live can connect, and only to its Live server, when all of these hold:
  - It is inside the live time.
  - The file is opened directly (not inside an LMS or another page's frame; there it only shows a "Join in the browser" link).
  - The participant presses "Join" once.
- "Send feedback", in the ? key list and the presenter view, opens GitHub in a new window only when pressed.
- Links to other sites in a lesson show the destination and ask before opening. A lesson whose creator added an embed (YouTube, Vimeo, Google Maps, OpenStreetMap) allows those destinations to be shown, and they may load from there when the lesson is opened.
- Progress: opened inside an LMS (SCORM 1.2), the player passes progress (started, finished, the place reached, which steps were seen, session time) to that LMS. Embedded in another page (`?embed=1`), it tells the embedding page the same events. Otherwise it only stores them on the device of the person who opened the lesson (see the table above).

## Checking it at a school

Checking with the CSP (the connection policy):

1. Open the `.ega.html` in a text editor. Near the top of `<head>` there is one `<meta>` with `Content-Security-Policy`.
2. If its `connect-src` is `'none'`, the file does not connect anywhere. With Live, it connects only to the one server listed in `connect-src` (`https://…` and `wss://…`).
3. If YouTube or others are added to `frame-src`, the lesson uses embeds.
4. The Studio page (studio.egatari.org) has `default-src 'self'`, `connect-src 'self'`, `frame-src 'none'`. Only the AI voice window (`lab/tts-helper.html`) connects, and only to `cdn.jsdelivr.net`, `huggingface.co` and `us.aws.cdn.hf.co`.
5. Egatari Viewer sets its connection policy in HTTP headers (`_headers`). It connects only to itself and to Live servers (by default live.egatari.org).

To block connections:

- In the school filter, block `cdn.jsdelivr.net`, `huggingface.co`, `us.aws.cdn.hf.co`, `colab.research.google.com` and `live.egatari.org`. Editing, saving and playing still work. Only "Make AI voice on this computer", Colab and Live stop working.
- To work without a network, hand out `editor.html` (the offline editor, one HTML file). AI voice "on this computer" is not available there, but recording and audio made beforehand work.
- Audio already made and exported `.ega.html` files work without a network (when they have no Live).

## Contact

Ask about this page or how to use Egatari in GitHub [Issues](https://github.com/egatari/egatari-studio/issues) or [Discussions](https://github.com/egatari/egatari-studio/discussions). For anything that should not be made public (personal data, security problems), use GitHub's private reporting ([Report a vulnerability](https://github.com/egatari/egatari-studio/security/advisories/new)). Only the Egatari developers read it.

## Site logs

GitHub and Cloudflare, which host the sites, keep access logs (IP address, browser type, pages opened and so on), as for any website. We don't use those logs for analytics or advertising, and we have not added any analytics.

The Live server (live.egatari.org) keeps the contents of a Live (questions, votes, "I'm lost" marks, a name only if typed, the random ID made on the device) in that Live only. They are deleted automatically when a grace period after the end of the live time has passed (24 hours by default; the host who creates the Live can choose 0 to 7 days). To keep the results, download them from the host page during the grace period.

After that, Cloudflare's platform, where the server runs, still keeps backups for up to 30 days. They hold only the Live contents listed above, and nothing we never stored, such as IP addresses. Restoring from these backups would require us to write and run code for it, which we do not do. After 30 days the backups are gone too. If this is a concern, export the lesson without Live, or name in the lesson a Live server the creator runs themselves.

IP addresses, browser information and access logs are not stored (request logging is turned off). The IP address is used only when a Live is created, to prevent mass creation (Cloudflare's Turnstile check and a rate limit), and is not stored. If the lesson names a different Live server, that server's own rules apply.

---

## Appendix: evidence in the code (for maintainers)

Checked against branch v0.6.6-privacy (after the merge of v0.6.5-rc.2). The Live server was read in egatari/live at cb66c3e. Recheck the line numbers before each release.

### Studio page (studio.egatari.org)
- CSP meta: `app/index.html` line 10 (`default-src 'self'`; `connect-src 'self'`; `frame-src 'none'`; `worker-src blob:`; `form-action 'none'`). Referrer: line 11 (`no-referrer`). No `_headers` for the Studio site; deploy is GitHub Pages: `.github/workflows/pages.yml` lines 15–17, 112, 129.
- Preview: CSP `connect-src 'none'`, `app/preview-doc.js` lines 13–15; the preview frame is sandboxed without `allow-same-origin`, `app/index.html` line 158; `server/hints.js` line 38 sets `DECK_DEV` there, so the player keeps nothing (`kit/track.js` line 264).
- Same-origin fetches only: lazy fonts `app/main.js` line 69; examples line 232; bounded fetch `app/bounded-read.js` line 44; `versions.json` `app/version-ui.js` lines 48–54, 73–78 (http(s) only, line 73); MP3 encoder from `vendor/lame-wasm` `app/mp3-loader.js` lines 14–18 (skipped on file:, line 13), copied by `tools/build-app.mjs` lines 246–251.
- Offline single-file `editor.html`: `tools/build-app.mjs` lines 300–311; no TTS window on file: `app/tts-client.js` lines 50, 90.
- No service worker in Studio (`serviceWorker` appears only in `play/main.js` lines 404–457). A web manifest is written: `tools/build-app.mjs` lines 214–218, 236.
- No analytics: a grep for analytics/beacon/plausible/gtag/googletagmanager/cloudflareinsights/sentry/telemetry/sendBeacon over `app kit play server lab tools/build-app.mjs tools/build-play.mjs` finds nothing. Page templates: `app/index.html` lines 1–14, `tools/build-app.mjs` lines 233–234, 277–289, 306–309, `play/index.html` lines 1–10.

### AI voice on this computer
- Window and trigger: `app/tts-client.js` lines 71–83 (opens `lab/tts-helper.html`, window `studio-tts`); confirmation before first use lines 99–102; only text and voice name go in, PCM comes out, lines 10–13, 107. Sizes shown lines 21–22, labels lines 42–46.
- Window CSP: `lab/tts-helper.html` line 16 (`script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'sha256-…'` for the import map; `connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://us.aws.cdn.hf.co blob:`; `worker-src 'none'`; no `'unsafe-eval'`), reasons lines 8–15; referrer line 17; import map with `integrity` line 18. Checked by `tools/test-lab-csp.mjs`.
- Sources: onnxruntime-web and transformers.js from jsDelivr, `lab/tts-engine.mjs` lines 10–16 (pinned versions lines 10–11); Irodori weights `noguchis/irodori-tts-onnx` at a pinned revision, lines 17–19; kokoro-js lines 50–55; Kokoro weights `onnx-community/Kokoro-82M-v1.0-ONNX` pinned lines 56–57, files with SHA-256 from line 83. Content pins (SRI): lines 61–77, `importPinned` / `fetchVerified` lines 183–195. Download and cache: lines 224–255 (Cache Storage `irodori-lab-<rev12>`, `cache: 'no-store'`, `fetch` line 232, `store.put` line 254). Bundled reference voices from the same origin, line 384.
- Cache names and delete: `lab/model-cache.mjs` lines 5–7, 19–24, 28–49; persist request lines 60–68 and `lab/tts-engine.mjs` lines 261–266; UI `app/model-cache-ui.js` lines 1–5, 41.
- Read-aloud uses local voices only: `kit/core/read-aloud.mjs` lines 3, 99–100; `app/read-aloud.js` line 3.

### Colab
- Export and one-time confirmation: `app/audio-panel.js` line 198 (`PRIVACY_KEY`), 214, 865–885; text of the confirmation `app/i18n.js` line 379 (ja) and 806 (en). Job content: `kit/core/colab-core.mjs` lines 79–107 (segments after the reading dictionary, voice names, title up to 120 characters line 79, docId, generator version, recipe).
- Open link (user click, `target=_blank rel=noopener`): `app/audio-panel.js` line 522; URL `kit/core/colab-core.mjs` line 53 (pinned tag line 47). The user picks the file in Colab: lines 27–39; "Google account required" line 41. Import is a plain `<input type=file>`: `app/audio-panel.js` lines 890–893.
- Notebook network: `colab/egatari-tts.ipynb` line 89 (git clone), 93 (uv pip install), 199–223 (huggingface_hub; kokoro-onnx release download lines 202–203), 226 (npm), 127 and 161 (`files.upload()`, own reference voice optional), 266 (`files.download`).

### Feedback
- URL builder: `kit/deck.js` lines 485–511 (default `https://github.com/egatari/egatari-studio/issues/new`, fields version, browser, os, language, mode). Off switch `data-feedback="off"` line 489. Links: `kit/tools.js` lines 1052–1056 and `kit/presenter.js` lines 48–49 (`target=_blank rel=noopener`).

### Live (player side)
- `kit/live.js` lines 1–12 (what is sent, one tap, tab-only memory), 98–109 (storage), 516–526 (connect: the join code and pid go in the first message, line 519 and `onopen` line 526).
- Address carries only the Live ID: `kit/core/live-policy.mjs` lines 169–174; first message `join` lines 175–178. Join link keeps the code after `#`: line 222. Context gating: lines 202–216, 224–230.
- Egatari Viewer: `play/live-host.mjs` lines 21–26, 150–163 (line 159: same `join` message); endpoints from `tools/build-play.mjs` lines 5, 18–21, 40–47.
- CSP written into the `.ega.html`: `kit/core/file-policy.mjs` lines 24–28 (baseline `connect-src 'none'`), 31–40 (Live replaces `'none'`; frame-src additions); default endpoint `kit/core/format.mjs` line 30; storage prefix line 34.
- The same in the user docs: `docs/distributing.md` lines 57–67.
- Studio side: no network; copy, download and link only: `app/live-panel.js` lines 182, 302, 328–341.

### Live server (egatari/live at cb66c3e)
- Grace period: `src/limits.js` lines 58–59 (default 24 h, max 168 h); validated 0–168 in `src/protocol.js` lines 389–395; host page input `public/index.html` lines 39, 52 (`min="0" max="168"`, default 24).
- Deletion: `src/room.js` lines 219–237 (the alarm at the end of the window plus the grace period calls `storage.deleteAll()`, line 230). Results download on the host page: `public/teacher.js` line 495.
- What a participant record holds: `src/room.js` line 292 (`pid`, status, name, count, first time). No IP or user agent is read in the room.
- IP only at creation: `src/index.js` lines 68–71 (rate limit keyed by `cf-connecting-ip`, not stored) and line 95 (Turnstile, `src/turnstile.js` lines 24, 33).
- No request logs: `wrangler.production.toml` lines 44–45 (`observability enabled = false`).

### Gallery and doc links
- `app/parts-gallery.js` lines 6–8; `app/llm.js` line 791; `app/earlier-draft.js` lines 18–22, 65; `app/main.js` lines 1727, 2146; `app/i18n.js` lines 367–369, 796–798 (all user-click links, `rel=noopener`).

### Fonts
- No CDN fonts. Studio `font-src 'self' data:` (`app/index.html` line 10); fonts from `fonts/` (`tools/build-app.mjs` lines 88–99, 238–244); the single file embeds them, lines 300–309. Viewer uses system fonts (`play/sw.js` lines 4–5).

### Storage (Studio)
- `motion-editor-lang`: `app/i18n.js` lines 11, 15; `app/main.js` line 2367; `app/version-ui.js` line 44.
- `egatari-colab-privacy-ok`: `app/audio-panel.js` lines 198, 214, 872.
- `egatari-rec-keep-recording`: `app/rec-mode.js` lines 28, 56, 101.
- `egatari-slides-open`: `app/slides-panel.js` lines 28, 382, 391.
- `egatari-studio-live-results-notice`: `app/attachments-panel.js` lines 24–26.
- sessionStorage `motion-editor-reopen`: `app/main.js` lines 2370, 2377.
- IndexedDB `motion-slides-editor` (handles only, up to 8): `app/fsx.js` lines 121–123, 141–151; `egatari-theme-folder`: `app/theme-folder.js` lines 47–58, `app/my-themes.js` line 70.
- `.cache/edits/` in the user's folder, up to 30: `app/fsx.js` lines 90–106.

### Storage and progress (player)
- `deck-capsize`: `kit/deck.js` lines 1373, 1506. `<format>-player-bar-hint-v1`: `kit/tools.js` lines 803, 947–959. Live pid and joined: `kit/live.js` lines 98–109, 538–567. Position in the address: `kit/deck.js` lines 1732, 2032.
- Layout, divider, reading settings and "Resumed where you left off": `kit/panes.js` lines 11–14, 28, 38–41, 339, 830–842, 917–945 (not used when embedded, in an LMS or in the preview: lines 931–937).
- Progress: `kit/track.js` lines 1–14; SCORM 1.2 lines 114–167 (`cmi.core.lesson_status`, `lesson_location`, `suspend_data`, `session_time`); postMessage to the embedding page lines 168–177; this device lines 178–185; choice of one lines 273, 299.
- Viewer: `play/recents.mjs` lines 1–3, 9–14, 19–52, 57– (OPFS `recent/`, IndexedDB `egatari-viewer`, up to 10); keep on by default `play/main.js` lines 331–340, 368–374, `SHARED_DEVICE_DEFAULT = false` line 23; clearing on a shared device lines 384–386; install hint line 469; language `play/i18n.mjs` lines 129–135.
- Viewer service worker caches only its own files: `play/sw.js` lines 1–9, 21–27, 64–82; headers `tools/build-play.mjs` lines 40–66; Worker `play/worker.js` lines 5–22; `play/wrangler.production.toml` lines 20–21 (`observability enabled = false`), 12 (custom domain). Share target keeps the file in memory for 60 s: `play/sw.js` lines 10–11, 50–62.

### Player (`.ega.html`) requests
- Baseline CSP: `kit/core/file-policy.mjs` lines 24–28. Embed destinations: line 30.
- Links to other sites: confirmation `kit/deck.js` lines 2077–2079, 2136–2152; `window.open(…, 'noopener,noreferrer')` `kit/core/link-policy.mjs` line 16. The preview refuses, `kit/deck.js` line 2143.
