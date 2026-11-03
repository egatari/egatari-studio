### Fixed

- Viewer: the player's **Fullscreen** button and `f` did nothing in Egatari Viewer (the lesson's frame has no fullscreen permission, so
  every browser refused). The lesson now asks the page, which puts the frame itself into fullscreen and reports the state back, so the
  button shows pressed, and Esc, the button and `f` leave it; this works with any player inside the file. The frame still gets no
  fullscreen permission, and the page's `Permissions-Policy` now says `fullscreen=(self)`
- Player: fullscreen falls back to `webkitRequestFullscreen` (older iPadOS Safari), and says “Could not go fullscreen” when the browser
  refuses instead of failing silently. Where the browser has no element fullscreen (iPhone Safari) or a frame does not allow it, the bar
  has no fullscreen button and the key list leaves out `f`
