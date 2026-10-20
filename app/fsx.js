// フォルダの読み書き（File System Access API）。編集アプリはここを通してだけ、選ばれたデッキのフォルダに触る
// 場所はフォルダからの相対パス（"/" 区切り、先頭に / を付けない）
import { backupStamp, isBackupName } from '../kit/core/backup-name.mjs';
import { readFileBounded, readFileBoundedText } from './bounded-read.js';

// 一覧に入れないもの：ドットで始まる名前（.cache の控え・.git・.env など）、組んだ出力・音声・動画・依存
const SKIP = new Set(['node_modules', 'out', 'audio', 'video', 'bundle', '__pycache__']);
const MAX_FILES = 3000, MAX_DEPTH = 10;

// フォルダの中を歩く → {files: Map(rel → {h, m, s}), dirs: Set(rel)}。m = lastModified、s = size。
// {audio: true} なら audio/ も入れる（持ち運べる 1 ファイルへの書き出しで、音声も読むため）。maxDepth：降りるフォルダの深さ（既定 MAX_DEPTH）
export async function walk(root, { audio = false, maxDepth = MAX_DEPTH } = {}) {
  const files = new Map(), dirs = new Set();
  async function go(dir, prefix, depth) {
    if (depth > Math.min(maxDepth, MAX_DEPTH)) return;
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.') || (SKIP.has(name) && !(audio && name === 'audio'))) continue;
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
// ファイルの中身（文字）。なければ null。opts.max：読んでよいバイト数（既定は READ_LIMITS.default）。File.size を読む前に、読んだ後も実際の
// バイト数を確かめ、超えれば読まずに（読んだ後なら捨てて）ReadOverError（code 'read-over'。app/bounded-read.js）
export async function readText(root, rel, opts = {}) {
  let h;
  try { h = await fileHandle(root, rel); }
  catch (e) { if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null; throw e; }
  let file;
  try { file = await h.getFile(); }
  catch (e) { if (e && e.name === 'NotFoundError') return null; throw e; }
  return (await readFileBoundedText(file, { max: opts.max, what: rel })).text;
}
// opts.max：読んでよいバイト数。arrayBuffer() の直前に File.size を確かめ、超えるなら読まずに、読んだ後も超えていれば断る
// （code 'read-over'、n は超えた大きさ。編集アプリの組み立てが上限の知らせに替える。app/bounded-read.js）
export async function readBytes(root, rel, { max = Infinity } = {}) {
  const file = await (await fileHandle(root, rel)).getFile();
  return readFileBounded(file, { max, what: rel });
}
// 書き込みの取り消し：live() が false（始めたときの作業場所・保存がもう今のものでない）なら書かない
export function cancelledError() { return Object.assign(new Error('cancelled: the workspace changed'), { name: 'Cancelled', code: 'cancelled' }); }
// ファイルのハンドルに書く（File System Access API の書き込みは一時ファイルに書いて close() で入れ替える）。
// live()：await のたび（書き込みを作る・書く）に確かめ、今のものでなくなっていれば abort() して入れ替えない（取り消しを書き込みの中まで運ぶ）。
// 最後に確かめてから close() を呼ぶまでの間に await はない
export async function writeFile(h, data, live = () => true) {
  if (!live()) throw cancelledError();
  const w = await h.createWritable();
  try {
    if (!live()) throw cancelledError();
    await w.write(data);
    if (!live()) throw cancelledError();
  } catch (e) { try { await w.abort(); } catch { /* 閉じられない */ } throw e; }
  await w.close();
}
export async function writeText(root, rel, text, live = () => true) {
  if (!live()) throw cancelledError();
  const h = await fileHandle(root, rel, true);
  await writeFile(h, text, live);
}
export const writeBytes = writeText;   // createWritable の write は文字列もバイト列も受け取る
export async function exists(root, rel) {
  try { await fileHandle(root, rel); return true; } catch { return false; }
}

// 書き換える前の控え：.cache/edits/<時刻>-<名前>（新しい 30 個だけ残す。開発サーバーと同じ）。
// 掃除で消すのは控えの名前の形（kit/core/backup-name.mjs。開発サーバーの pruneBackups と同じ）のファイルだけ。ほかのファイルとフォルダには触れない
// ファイルを消す（添付の板）。消す前に中身のバイトを .cache/edits/ に控える（控えは opts.max バイトまで。超えれば控えずに断る）
export async function removeFile(root, rel, live = () => true, opts = {}) {
  const { d, name } = await dirOf(root, rel, false);
  const bytes = await readBytes(root, rel, { max: opts.max === undefined ? Infinity : opts.max });
  if (!live()) throw cancelledError();
  const edits = await (await root.getDirectoryHandle('.cache', { create: true })).getDirectoryHandle('edits', { create: true });
  const h = await edits.getFileHandle(`${backupStamp(Date.now())}-${name}`, { create: true });
  const w = await h.createWritable(); await w.write(bytes); await w.close();
  if (!live()) throw cancelledError();
  await d.removeEntry(name);
}
export const KEEP_EDITS = 30;
export async function backup(root, rel, now = Date.now, opts = {}) {
  const text = await readText(root, rel, opts);
  if (text === null) return;
  const edits = await (await root.getDirectoryHandle('.cache', { create: true })).getDirectoryHandle('edits', { create: true });
  const h = await edits.getFileHandle(`${backupStamp(now())}-${rel.split('/').pop()}`, { create: true });
  const w = await h.createWritable(); await w.write(text); await w.close();
  const names = [];
  for await (const [name, e] of edits.entries()) if (e.kind === 'file' && isBackupName(name)) names.push(name);
  names.sort();
  for (const n of names.slice(0, Math.max(0, names.length - KEEP_EDITS))) { try { await edits.removeEntry(n); } catch { /* 消せなくてもよい */ } }
}

// 読み書きの許可（開き直したフォルダは、もう一度ユーザーに許可を求める）
export async function hasPermission(h, mode = 'readwrite') {
  if (!h.queryPermission) return true;
  return (await h.queryPermission({ mode })) === 'granted';
}
export async function askPermission(h, mode = 'readwrite') {
  if (!h.requestPermission) return true;
  return (await h.requestPermission({ mode })) === 'granted';
}

// ---------------------------------------------------------------- 最近開いたもの（作業フォルダと 1 ファイル。IndexedDB にハンドルを残す。中身は残さない）
// 公開のサイトの凍結した写し（/vX.Y.Z/）とも同じ DB を使う（同じ origin）。古い版も開くので、形を変えるときは DB の名前を替える
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
