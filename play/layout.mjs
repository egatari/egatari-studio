// Egatari Play: where the lesson's frame and the Live controls go. Chosen once when the lesson starts (and again only when the
// device is rotated or the window is resized), never while the viewer uses the page: the frame's geometry never changes under a tap.
// Why: the lesson's frame runs in its own process, and Chrome hands a tap to it by hit-test data from the last frame shown, so a
// control that has just appeared where the lesson was (a pane over the frame, or a frame that just shrank) can lose its first tap
// to the lesson (measured: docs/play.md). Controls therefore live outside the frame's area from the start.
//
//   computeLayout({w, h, headerH, live, polls, variant}) → {mode, header, frame: {x, y, w, h}, live: {x, y, w, h} | null, stage: {w, h}}
//     w, h      the viewport; headerH the page's bar when shown
//     live      the lesson has a valid Live room; polls: it has a poll activity on any step
//     variant   for a phone in landscape with no side slack (16:9 screens): 'strip' (the stage shrinks by STRIP_H and the indicator
//               gets its own strip; the poll replaces the strip) or 'overlay' (the indicator and the poll sheet lie over the frame)
//   modes: 'none' (no Live: the frame fills the player), 'side' (pane beside, wide screens with polls), 'bottom' (pane below the
//   16:9 stage, portrait with polls), 'bar' (a slim bar below, Live without polls), 'slack' (phone landscape: the stage fills the
//   height and the controls use the side slack), 'strip' / 'overlay' (phone landscape without slack)
export const SIDE_W = 340, BAR_H = 44, STRIP_H = 28, MIN_SLACK = 120, PLAYER_CONTROLS_H = 56, MIN_PANE_H = 200;
const r = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
const stageIn = (w, h) => (w / h > 16 / 9 ? { w: Math.round(h * 16 / 9), h: Math.round(h) } : { w: Math.round(w), h: Math.round(w * 9 / 16) });

export function isPhoneLandscape(w, h) { return w > h && h <= 500; }

export function computeLayout({ w, h, headerH, live, polls, variant = 'strip' }) {
  if (!live) { const ph = h - headerH; return { mode: 'none', header: true, frame: r(0, 0, w, ph), live: null, stage: stageIn(w, ph) }; }
  if (isPhoneLandscape(w, h)) {
    const sw = Math.round(h * 16 / 9), slack = w - sw;
    if (slack >= MIN_SLACK) return { mode: 'slack', header: false, frame: r(0, 0, sw, h), live: r(sw, 0, slack, h), stage: { w: sw, h } };
    if (variant === 'overlay') return { mode: 'overlay', header: false, frame: r(0, 0, w, h), live: r(0, 0, w, STRIP_H), stage: stageIn(w, h) };
    return { mode: 'strip', header: false, frame: r(0, STRIP_H, w, h - STRIP_H), live: r(0, 0, w, STRIP_H), stage: stageIn(w, h - STRIP_H) };
  }
  const ph = h - headerH;
  const wide = w >= 760 && w / ph >= 1.25;
  if (!polls) return { mode: 'bar', header: true, frame: r(0, 0, w, ph - BAR_H), live: r(0, ph - BAR_H, w, BAR_H), stage: stageIn(w, ph - BAR_H) };
  if (wide) return { mode: 'side', header: true, frame: r(0, 0, w - SIDE_W, ph), live: r(w - SIDE_W, 0, SIDE_W, ph), stage: stageIn(w - SIDE_W, ph) };
  const fh = Math.max(120, Math.min(Math.round(w * 9 / 16) + PLAYER_CONTROLS_H, ph - MIN_PANE_H));
  return { mode: 'bottom', header: true, frame: r(0, 0, w, fh), live: r(0, fh, w, ph - fh), stage: stageIn(w, fh) };
}
