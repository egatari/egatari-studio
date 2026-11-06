### Added

- Viewer: once the first file lands in the recent list (keeping on, shared device off), the page asks the browser once per
  launch for persistent storage (`navigator.storage.persist()`, errors ignored, never blocking playback), so WebKit
  (Safari 17+, iOS 17+) stops evicting the origin on its own; the recent files panel shows the browser's actual answer
  (`navigator.storage.persisted()`) under 「この端末にだけ保存されます」, hidden in shared-device mode or with nothing kept.
