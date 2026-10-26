// 利用者のテーマのフォルダ（たとえば ~/.egatari/themes）：コマンドの EGATARI_THEMES・~/.egatari/themes の代わりに、編集アプリでは
// 1 回だけフォルダを選んでもらい、そのハンドルを IndexedDB に残す（中身は残さない）。読むだけ（mode: 'read'。書かない）
// 組み立ては、このフォルダを /user-themes として、コマンドと同じ順（原稿のフォルダ → その themes/ → このフォルダ → 同梱の themes/）と
// 同じ根の決まりで探す（kit/core/build-core.mjs の resolveTheme。app/engine.js）。中身は原稿のファイルと同じく信頼しない
//   themeFolderWorkspace(handle)  組み立てに渡す作業場所（list・readBytes だけ。書く口はない）
//   loadThemeFolder() → handle | null、saveThemeFolder(handle, at)、forgetThemeFolder()   IndexedDB（使えなければ null・何もしない）
//   loadThemeFolderAt() → 選んだ時刻（zip のテーマとの後先。app/theme-zip.js）。themeDbTx：同じデータベース（zip のテーマも入れる）
//   permissionOf(handle) → 'granted' | 'prompt' | 'denied'、requestRead(handle) → bool（人の操作の中で呼ぶ）
import { walk, readBytes } from './fsx.js';
import { readFileBoundedText } from './bounded-read.js';

// テーマは themes/<名前>/{tokens.css, theme.json, ロゴ}。深いフォルダ（間違えて大きなフォルダを選んだとき）は歩かない
const THEME_DEPTH = 3;
export function themeFolderWorkspace(handle) {
  return {
    kind: 'themes', name: handle.name, handle,
    list: () => walk(handle, { maxDepth: THEME_DEPTH }),
    readBytes: (rel, o) => readBytes(handle, rel, o),
  };
}
// フォルダの中のテーマの名前（<名前>/tokens.css があるもの）
export async function themeNames(handle) {
  const out = [];
  for await (const [name, h] of handle.entries()) {
    if (h.kind !== 'directory' || name.startsWith('.')) continue;
    try { await h.getFileHandle('tokens.css'); out.push(name); } catch { /* テーマでない */ }
  }
  return out.sort();
}
// 見せる名前：<名前>/theme.json の title、なければ name、なければフォルダの名前（読めなければフォルダの名前）。字は 60 字まで
export async function themeLabel(handle, name) {
  try {
    const d = await handle.getDirectoryHandle(name);
    const j = JSON.parse((await readFileBoundedText(await d.getFileHandle('theme.json'), { max: 65536, what: name + '/theme.json' })).text);
    const t = [j && j.title, j && j.name].find((x) => typeof x === 'string' && x.trim());
    return t ? t.trim().slice(0, 60) : name;
  } catch { return name; }
}
export async function permissionOf(h) {
  try { return h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted'; } catch { return 'denied'; }
}
export async function requestRead(h) {
  try { return h.requestPermission ? (await h.requestPermission({ mode: 'read' })) === 'granted' : true; } catch { return false; }
}

// ---------------------------------------------------------------- IndexedDB（ハンドルだけ。最近開いたフォルダとは別のデータベース。zip のテーマは 'zip:<名前>'）
const DB = 'egatari-theme-folder', STORE = 'kv', KEY = 'themeFolder';
export function themeDbTx(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const d = r.result, t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE));
      t.oncomplete = () => { d.close(); res(q && 'result' in q ? q.result : undefined); };
      t.onerror = () => { d.close(); rej(t.error); };
    };
  });
}
export async function loadThemeFolder() {
  try { const v = await themeDbTx('readonly', (s) => s.get(KEY)); return v && v.handle && v.handle.kind === 'directory' ? v.handle : null; } catch { return null; }
}
export async function loadThemeFolderAt() {
  try { const v = await themeDbTx('readonly', (s) => s.get(KEY)); return (v && Number(v.saved)) || 0; } catch { return 0; }
}
export async function saveThemeFolder(handle, at = Date.now()) {
  try { await themeDbTx('readwrite', (s) => s.put({ handle, saved: at }, KEY)); return true; } catch { return false; }
}
export async function forgetThemeFolder() {
  try { await themeDbTx('readwrite', (s) => s.delete(KEY)); return true; } catch { return false; }
}
