// Egatari Play: read what the page needs from a lesson file without running it (spec §11, live §2A.1).
// The file is parsed as a string with parse5 under limits (kit/core/bounded-html.mjs); nothing is executed or loaded.
// Kept: deck-meta, deck-extensions and the index (egatari-index) — the JSON blocks of spec §3 and §4.
//
//   scanLesson(text) → {ok: true, kind: 'editable' | 'play-only', meta, live, liveFrom}
//                    | {ok: false, error: 'not-egatari' | 'parse' | 'too-complex'}
//     kind      'editable' when the archive layer (the index) is present (a portable file), else 'play-only' (spec §2, §3.7)
//     meta      {title, lang, docId, portable} from deck-meta
//     live      extensions.live as written in the file (deck-extensions in a play-only file, the index in an editable one), or null.
//               The caller validates it (kit/core/live-policy.mjs); nothing here trusts it
//     liveFrom  'deck-extensions' | 'index' | null
// Node and the browser (play/reader-worker.mjs) share this module.
import { boundedParse } from '../kit/core/bounded-html.mjs';
import { FORMAT } from '../kit/core/format.mjs';

const IDS = new Set(['deck-meta', 'deck-extensions', FORMAT.INDEX_ID]);
const MAX = { 'deck-meta': 256 * 1024, 'deck-extensions': 256 * 1024, [FORMAT.INDEX_ID]: 4 * 1024 * 1024 };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function scanLesson(text) {
  let doc;
  const watch = (attrs) => attrs.some((a) => a.name === 'id' && IDS.has(a.value));
  try {
    doc = boundedParse(String(text), { watch, fail: (code, message) => { throw Object.assign(new Error(message), { code }); } });
  } catch (e) {
    return { ok: false, error: e && e.code === 'too-complex' ? 'too-complex' : 'parse' };
  }
  const found = new Map(), dups = new Set();
  const visit = (n) => {
    if (n.attrs && n.tagName === 'script' && n.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const id = n.attrs.find((a) => a.name === 'id');
      if (id && IDS.has(id.value)) {
        if (found.has(id.value)) dups.add(id.value);
        let t = ''; for (const c of n.childNodes || []) if (c.nodeName === '#text') t += c.value;
        const type = ((n.attrs.find((a) => a.name === 'type') || {}).value || '').trim().toLowerCase();
        found.set(id.value, { type, text: t });
      }
    }
    for (const c of n.childNodes || []) visit(c);
    if (n.content) visit(n.content);
  };
  visit(doc);
  if (dups.size) return { ok: false, error: 'parse' };
  const json = (id, type) => {
    const b = found.get(id);
    if (!b || b.type !== type || b.text.length > MAX[id]) return null;
    try { const v = JSON.parse(b.text); return isObj(v) ? v : null; } catch { return null; }
  };
  const dm = json('deck-meta', 'application/json');
  if (!dm || dm.format !== FORMAT.FORMAT_ID) return { ok: false, error: 'not-egatari' };
  const index = found.has(FORMAT.INDEX_ID) ? json(FORMAT.INDEX_ID, FORMAT.MIME) : null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const meta = { title: str(dm.title, 300), lang: str(dm.lang, 35), docId: str(dm.docId, 100), portable: dm.portable === true };
  let live = null, liveFrom = null;
  const ext = json('deck-extensions', 'application/json');
  if (ext && isObj(ext.live)) { live = ext.live; liveFrom = 'deck-extensions'; }
  else if (index && isObj(index.extensions) && isObj(index.extensions.live)) { live = index.extensions.live; liveFrom = 'index'; }
  return { ok: true, kind: found.has(FORMAT.INDEX_ID) ? 'editable' : 'play-only', meta, live, liveFrom };
}
