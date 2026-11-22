// Egatari Viewer: the viewer's preferences the player reports (player spec P5 and P8 `prefs`, handoff #94). The lesson's frame has
// no storage of its own, so the page keeps them: the layout per lesson (its docId, or the file's SHA-256), the others once for this
// device (text size, text background, captions and their size). Kept in this page's localStorage only; nothing is kept on a shared
// device, and turning 「共有の端末」 on clears them. Untrusted input: only the members and values of the spec are read.
//
//   prefs.read(m)          → the members of a `prefs` event or reply that the spec defines, with values it allows ({} when none)
//   prefs.get(doc)         → the kept preferences for this lesson ({} when none)
//   prefs.keep(doc, p)     remembers p (as read())
//   prefs.clear()

const KEY = 'egatari-viewer-prefs';
const MAX = 50;
const LAYOUTS = ['slides', 'flow', 'split'], BGS = ['white', 'sepia', 'black'], CAPS = ['s', 'm', 'l'];

export function read(p) {
  const out = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  if (LAYOUTS.includes(p.layout)) out.layout = p.layout;
  if (typeof p.textSize === 'number' && Number.isFinite(p.textSize) && p.textSize >= 0.5 && p.textSize <= 4) out.textSize = p.textSize;
  if (BGS.includes(p.textBackground)) out.textBackground = p.textBackground;
  if (typeof p.captions === 'boolean') out.captions = p.captions;
  if (CAPS.includes(p.captionSize)) out.captionSize = p.captionSize;
  return out;
}
function readAll() {
  let v;
  try { v = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { v = {}; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) v = {};
  const layouts = {};
  if (v.layouts && typeof v.layouts === 'object' && !Array.isArray(v.layouts)) {
    for (const [doc, e] of Object.entries(v.layouts)) if (typeof doc === 'string' && doc.length <= 200 && e && LAYOUTS.includes(e.l) && Number.isFinite(e.at)) layouts[doc] = e;
  }
  const device = read(v.device);
  delete device.layout;
  return { device, layouts };
}
function writeAll(all) {
  const layouts = Object.fromEntries(Object.entries(all.layouts).sort((a, b) => b[1].at - a[1].at).slice(0, MAX));
  try { localStorage.setItem(KEY, JSON.stringify({ device: all.device, layouts })); } catch { /* storage full or blocked: not kept */ }
}
export function get(doc) {
  const all = readAll(), out = { ...all.device };
  if (all.layouts[doc]) out.layout = all.layouts[doc].l;
  return out;
}
export function keep(doc, p) {
  const all = readAll(), q = read(p);
  if (q.layout && typeof doc === 'string' && doc) all.layouts[doc] = { l: q.layout, at: Date.now() };
  delete q.layout;
  all.device = { ...all.device, ...q };
  writeAll(all);
}
export function clear() { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } }
