// Egatari Viewer: recent files, kept on this device only (OPFS; IndexedDB where OPFS cannot be written from a page).
// Only this page's origin can read them; the lesson's frame has an opaque origin and cannot (play/frame.mjs).
// Nothing is ever sent anywhere. The viewer can delete one file or all of them.
//
//   const R = await openRecents()          → {kind: 'opfs' | 'idb' | 'none', list(), add(file, info), get(id), remove(id), clear()}
//     list()        → [{id, name, size, title, kind, openedAt}] newest first
//     add(blob, info) info = {name, title, kind, docId}; the same name, size and docId replaces the older entry. Keeps MAX entries
//     get(id)       → Blob | null
import { readFileBoundedText } from '../app/bounded-read.js';

const MAX = 10;
const DIR = 'recent';
const INDEX = 'index.json';
const DB = 'egatari-play';
const STORE = 'recent';
const newId = () => { const b = crypto.getRandomValues(new Uint8Array(12)); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); };
const ID_RE = /^[0-9a-f]{24}$/;
const sameFile = (a, b) => a.name === b.name && a.size === b.size && (a.docId || '') === (b.docId || '');
const clean = (e) => ({ id: e.id, name: String(e.name || '').slice(0, 300), size: e.size | 0, title: String(e.title || '').slice(0, 300), kind: e.kind === 'editable' ? 'editable' : 'play-only', docId: String(e.docId || '').slice(0, 100), openedAt: +e.openedAt || 0 });

// ---------------------------------------------------------------- OPFS
async function opfs() {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') return null;
  if (typeof FileSystemFileHandle === 'undefined' || typeof FileSystemFileHandle.prototype.createWritable !== 'function') return null;
  const root = await navigator.storage.getDirectory();
  let dir = await root.getDirectoryHandle(DIR, { create: true });
  const write = async (name, data) => { const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(data); await w.close(); };
  const readIndex = async () => {
    try { const f = await (await dir.getFileHandle(INDEX)).getFile(); const v = JSON.parse((await readFileBoundedText(f, { max: 1024 * 1024, what: 'recent index' })).text); return Array.isArray(v) ? v.filter((e) => e && ID_RE.test(e.id)).map(clean) : []; } catch { return []; }
  };
  const drop = async (id) => { try { await dir.removeEntry(id + '.html'); } catch { /* already gone */ } };
  // probe once: some browsers expose the API but refuse to write (private windows)
  await write('.probe', new Blob(['ok'])); await dir.removeEntry('.probe');
  return {
    kind: 'opfs',
    async list() { return (await readIndex()).sort((a, b) => b.openedAt - a.openedAt); },
    async add(blob, info) {
      let ix = await readIndex();
      const entry = clean({ id: newId(), name: info.name, size: blob.size, title: info.title, kind: info.kind, docId: info.docId, openedAt: Date.now() });
      await write(entry.id + '.html', blob);
      for (const e of ix.filter((e) => sameFile(e, entry))) await drop(e.id);
      ix = [entry, ...ix.filter((e) => !sameFile(e, entry))].sort((a, b) => b.openedAt - a.openedAt);
      for (const e of ix.slice(MAX)) await drop(e.id);
      await write(INDEX, new Blob([JSON.stringify(ix.slice(0, MAX))], { type: 'application/json' }));
      return entry;
    },
    async get(id) { if (!ID_RE.test(id)) return null; try { return await (await dir.getFileHandle(id + '.html')).getFile(); } catch { return null; } },
    async touch(id) { const ix = await readIndex(); const e = ix.find((x) => x.id === id); if (!e) return; e.openedAt = Date.now(); await write(INDEX, new Blob([JSON.stringify(ix)], { type: 'application/json' })); },
    async remove(id) { const ix = await readIndex(); await drop(id); await write(INDEX, new Blob([JSON.stringify(ix.filter((e) => e.id !== id))], { type: 'application/json' })); },
    async clear() { await root.removeEntry(DIR, { recursive: true }); dir = await root.getDirectoryHandle(DIR, { create: true }); },
  };
}

// ---------------------------------------------------------------- IndexedDB
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idb() {
  if (typeof indexedDB === 'undefined') return null;
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => { const d = open.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
  const db = await req(open);
  const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE);
  const all = async () => (await req(tx('readonly').getAll())).filter((e) => e && ID_RE.test(e.id));
  return {
    kind: 'idb',
    async list() { return (await all()).map(clean).sort((a, b) => b.openedAt - a.openedAt); },
    async add(blob, info) {
      const entry = clean({ id: newId(), name: info.name, size: blob.size, title: info.title, kind: info.kind, docId: info.docId, openedAt: Date.now() });
      const ix = await all();
      const st = tx('readwrite');
      for (const e of ix.filter((e) => sameFile(e, entry))) st.delete(e.id);
      await req(st.put({ ...entry, blob }));
      const rest = (await all()).sort((a, b) => b.openedAt - a.openedAt).slice(MAX);
      if (rest.length) { const s2 = tx('readwrite'); for (const e of rest) s2.delete(e.id); }
      return entry;
    },
    async get(id) { if (!ID_RE.test(id)) return null; const e = await req(tx('readonly').get(id)); return e && e.blob instanceof Blob ? e.blob : null; },
    async touch(id) { const e = await req(tx('readonly').get(id)); if (e) await req(tx('readwrite').put({ ...e, openedAt: Date.now() })); },
    async remove(id) { await req(tx('readwrite').delete(id)); },
    async clear() { await req(tx('readwrite').clear()); },
  };
}

const NONE = { kind: 'none', async list() { return []; }, async add() { return null; }, async get() { return null; }, async touch() {}, async remove() {}, async clear() {} };
// opts.prefer: 'idb' forces the fallback (tests)
export async function openRecents(opts = {}) {
  if (opts.prefer !== 'idb') { try { const o = await opfs(); if (o) return o; } catch { /* fall back */ } }
  try { const d = await idb(); if (d) return d; } catch { /* none */ }
  return NONE;
}
