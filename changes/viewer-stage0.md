### Added

- Egatari Viewer stage 0: works offline once opened (the app shell is precached by its service worker; lessons are still read on the device only); a new version takes over on the next launch only, never while a lesson plays (no update button); the manifest names it "Egatari Viewer", "Ega Viewer" on the Home Screen, with the え icon. Config and docs move to viewer.egatari.org (`play/wrangler*.toml`, Worker `egatari-viewer`; docs/viewer.md, docs/viewer-sharing.md on getting a file onto an iPhone or iPad and opening it in the Viewer)
- Egatari Viewer on iPhone and iPad shows a one-line add-to-home-screen tip with iOS's own labels (Safari, or Chrome's 「表示を増やす」 and 「Web アプリとして開く」) in a browser tab, until dismissed; on Android, when the browser offers it, an Install button that calls `prompt()`; nothing from the Home Screen or on a PC
- `tools/studio-icons.mjs` builds Egatari Studio's own tab and app icon 「す」 (`assets/logo/studio/`: the ico files, a light/dark `favicon.svg`, the touch icon and the manifest icons) from the owner's SVGs in `assets/logo/studio/src/`; `tools/test-viewer-webkit.mjs` checks the Viewer in Playwright's WebKit at iPad sizes (a step of `npm test`; skipped where WebKit is not installed)

### Changed

- Egatari Studio's favicon, touch icon and manifest icons are 「す」; its manifest `short_name` is "Egatari Studio". The え mark stays on the header, Egatari Viewer and exported `.ega.html` files
- Egatari Viewer's messages end with what to do next (not an Egatari file, too large, read and parse errors, Live errors); joining a Live while offline says so at once; wording follows the terms (再生専用, 参加コード, 待機室, ステップ)

### Fixed

- Egatari Viewer on touch screens: a tap on the slide brings back the player's control bar, and a tap on a bar button acts in WebKit (the page's lesson shim; the player is unchanged)
