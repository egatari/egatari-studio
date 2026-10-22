### Added

- Egatari Play (`play/`, `tools/build-play.mjs` → `_play/`): a web app page that opens an Egatari file on the device and plays it, for iPhone and iPad (no local HTML from the Files app), Android `content://` trouble and chat previews that fail. The lesson runs in a `sandbox="allow-scripts"` srcdoc frame behind Studio's trusted preview prefix; recent files stay on the device (OPFS, IndexedDB fallback) and can be deleted; Android `share_target`; a versioned service worker that caches only the page's own files. Not deployed yet (docs/play.md)
- Egatari Play acts for the lesson in Live (format spec live §2A): the page shows Join in its own chrome and holds the WebSocket, learns the step from the lesson's position events and relays nothing into the lesson; endpoints the page does not allow get the join link. Links the lesson asks to open go through `kit/core/link-policy.mjs` in the page's own box

### Security

- Egatari Play refuses to run in a frame (`frame-ancestors 'none'`, `X-Frame-Options: DENY` in `_headers`, and a script check). Self-hosters need a host that sends headers (docs/play.md "Self-hosting")
