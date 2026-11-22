// Egatari Viewer: the position to reopen each lesson at (player spec P5: a host that keeps them SHOULD reopen the file at the last
// `position` it received, with `seek`). Kept on this device only (localStorage of this page's origin), per lesson: its docId, or the
// file's SHA-256 when it has none (the same key as handwriting, play/main.js inkDoc). Nothing is kept on a shared device; turning
// 「共有の端末」 on and deleting all recent files clear it. The newest MAX lessons are kept. Works when storage is empty or blocked.
//
//   resume.get(doc)                 → {slideKey, stepKey} | null
//   resume.set(doc, slideKey, stepKey)   remembers it (the opening slide's first step forgets it: nothing to resume)
//   resume.clear()

const KEY = 'egatari-viewer-resume';
const MAX = 50;
const isStr = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n;

function readAll() {
  let v;
  try { v = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {};
  for (const [doc, e] of Object.entries(v)) {
    if (isStr(doc, 200) && e && isStr(e.s, 200) && isStr(e.k, 16) && Number.isFinite(e.at)) out[doc] = { s: e.s, k: e.k, at: e.at };
  }
  return out;
}
function writeAll(all) {
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep))); } catch { /* storage full or blocked: not kept */ }
}

export function get(doc) {
  const e = readAll()[doc];
  return e ? { slideKey: e.s, stepKey: e.k } : null;
}
export function set(doc, slideKey, stepKey, first) {
  if (!isStr(doc, 200) || !isStr(slideKey, 200) || !isStr(stepKey, 16)) return;
  const all = readAll();
  if (first) { if (!(doc in all)) return; delete all[doc]; }
  else all[doc] = { s: slideKey, k: stepKey, at: Date.now() };
  writeAll(all);
}
export function clear() { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } }
