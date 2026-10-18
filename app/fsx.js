// フォルダの読み書き（File System Access API）。編集アプリはここを通してだけ、選ばれたデッキのフォルダに触る
// 場所はフォルダからの相対パス（"/" 区切り、先頭に / を付けない）
import { backupStamp, isBackupName } from '../kit/core/backup-name.mjs';
import { TooLargeError } from '../kit/core/read-limits.mjs';

// 一覧に入れないもの：ドットで始まる名前（.cache の控え・.git・.env など）、組んだ出力・音声・動画・依存
const SKIP = new Set(['node_modules', 'out', 'audio', 'video', 'bundle', '__pycache__']);
const MAX_FILES = 3000, MAX_DEPTH = 10;

// フォルダの中を歩く → {files: Map(rel → {h, m, s}), dirs: Set(rel)}。m = lastModified、s = size
export async function walk(root) {
  const files = new Map(), dirs = new Set();
  async function go(dir, prefix, depth) {
    if (depth > MAX_DEPTH) return;
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.') || SKIP.has(name)) continue;
      const rel = prefix + name;
      if (h.kind === 'directory') { dirs.add(rel); await go(h, rel + '/', depth + 1); }
      else {
        if (files.size >= MAX_FILES) return;
        let f;
        try { f = await h.getFile(); } catch { continue; }
        files.set(rel, { h, m: f.lastModified, s: f.size });
      }
    }
  }
  await go(root, '', 0);
  return { files, dirs };
}

async function dirOf(root, rel, create) {
  const parts = rel.split('/').filter(Boolean);
  const name = parts.pop();
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return { d, name };
}
export async function fileHandle(root, rel, create = false) {
  const { d, name } = await dirOf(root, rel, create);
  return d.getFileHandle(name, { create });
}
// ファイルの中身。なければ null。max バイトより大きければ読まずに TooLargeError（text() の前に File.size を、後に長さを確かめる）
export async function readText(root, rel, max = Infinity) {
  let f;
  try { f = await (await fileHandle(root, rel)).getFile(); }
  catch (e) { if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null; throw e; }
  if (f.size > max) throw new TooLargeError(rel, f.size, max);
  const t = await f.text();
  // UTF-8 の字の数はバイト数を超えない。超えたら読む間に替わった
  if (t.length > max) throw new TooLargeError(rel, t.length, max);
  return t;
}
export async function readBytes(root, rel) {
  return new Uint8Array(await (await (await fileHandle(root, rel)).getFile()).arrayBuffer());
}
export async function writeText(root, rel, text) {
  const h = await fileHandle(root, rel, true);
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}
export async function exists(root, rel) {
  try { await fileHandle(root, rel); return true; } catch { return false; }
}

// 書き換える前の控え：.cache/edits/<時刻>-<名前>（新しい 30 個だけ残す。開発サーバーと同じ）
// 掃除で消すのは控えの名前の形（kit/core/backup-name.mjs）をしたファイルだけ。利用者やデッキが置いたほかのファイルには触れない
const KEEP_EDITS = 30;
export async function backup(root, rel, max = Infinity) {
  const text = await readText(root, rel, max);
  if (text === null) return;
  const edits = await (await root.getDirectoryHandle('.cache', { create: true })).getDirectoryHandle('edits', { create: true });
  const h = await edits.getFileHandle(`${backupStamp()}-${rel.split('/').pop()}`, { create: true });
  const w = await h.createWritable(); await w.write(text); await w.close();
  const names = [];
  for await (const [name, e] of edits.entries()) if (e.kind === 'file' && isBackupName(name)) names.push(name);
  names.sort();
  for (const n of names.slice(0, Math.max(0, names.length - KEEP_EDITS))) { try { await edits.removeEntry(n); } catch { /* 消せなくてもよい */ } }
}

// 読み書きの許可（開き直したフォルダは、もう一度ユーザーに許可を求める）
export async function hasPermission(h) {
  if (!h.queryPermission) return true;
  return (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
}
export async function askPermission(h) {
  if (!h.requestPermission) return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// ---------------------------------------------------------------- 最近開いたフォルダ（IndexedDB にハンドルを残す。中身は残さない）
const DB = 'motion-slides-editor', STORE = 'recent', MAX_RECENT = 8;
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  }));
}
export async function recentList() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.opened - a.opened);
  } catch { return []; }
}
export async function recentAdd(handle) {
  try {
    const list = await recentList();
    let same = null;
    for (const r of list) { try { if (await r.handle.isSameEntry(handle)) { same = r; break; } } catch { /* 古いハンドル */ } }
    const id = same ? same.id : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await tx('readwrite', (s) => s.put({ id, name: handle.name, handle, opened: Date.now() }));
    const rest = (await recentList()).slice(MAX_RECENT);
    if (rest.length) await tx('readwrite', (s) => { for (const r of rest) s.delete(r.id); });
  } catch { /* 残せなくても開ける */ }
}
export async function recentRemove(id) { try { await tx('readwrite', (s) => s.delete(id)); } catch { /* 無視 */ } }
