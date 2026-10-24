// 自分のテーマ（このブラウザに中身ごと覚えておくテーマ）。テーマはテーマの名前の下のファイルの組（tokens.css・theme.json・ロゴ・LICENSE*）で、
// どこから来たかには結ばない（source：'zip' が今。後で 'builder'）。テーマのフォルダ（app/theme-folder.js。ハンドルだけを覚える）とは別
//   loadMyThemes() → Map<名前, {files: Map<場所, Uint8Array>, at, source, from}>
//   putMyTheme(name, files, {source, from, at}) → 記録 | null   1 つ足す・同じ名前なら替える（ほかのモジュールからも。名前は RE.registryName）
//   forgetMyThemes()   すべて忘れる
//   mergedThemeWorkspace(folderWs, folderAt, myThemes)  テーマのフォルダ（themeFolderWorkspace か null）と自分のテーマを 1 つの作業場所にする
//     （list・readBytes だけ。書く口はない）。組み立てはこれを /user-themes として読むので、探す順と根の決まりはテーマのフォルダと同じ。
//     同じ名前のテーマがフォルダと自分のテーマの両方にあれば、あとから選んだ・入れたほう（folderAt とテーマの at の新しいほう）を使う
//   themeNamesOf(ws)・themeLabelOf(ws, name)   作業場所のテーマの名前と見せる名前
// IndexedDB はテーマのフォルダと同じデータベースの 'my:<名前>'
import { ReadOverError } from '../kit/core/bounded-read-core.mjs';
import { RE } from '../kit/core/portable.mjs';
import { themeDbTx } from './theme-folder.js';

const JSON_MAX = 65536;
// ---------------------------------------------------------------- 組み立てに渡す作業場所
const EMPTY = () => ({ files: new Map(), dirs: new Set() });
// myThemes：Map<名前, {files: Map<場所, Uint8Array>, at}>。folderAt：テーマのフォルダを選んだ時刻
export function mergedThemeWorkspace(folderWs, folderAt, myThemes) {
  let mineWins = new Set();   // 最後の一覧で自分のテーマのほうを使った名前
  const w = {
    kind: 'themes', name: folderWs ? folderWs.name : 'my-themes',
    async list() {
      const F = folderWs ? await folderWs.list() : EMPTY();
      const inFolder = new Set([...F.files.keys()].filter((r) => /^[^/]+\/tokens\.css$/.test(r)).map((r) => r.split('/')[0]));
      const wins = new Set([...myThemes].filter(([n, z]) => !inFolder.has(n) || z.at > folderAt).map(([n]) => n));
      const out = EMPTY();
      for (const [r, f] of F.files) if (!wins.has(r.split('/')[0])) out.files.set(r, f);
      for (const d of F.dirs) if (!wins.has(d.split('/')[0])) out.dirs.add(d);
      for (const n of wins) {
        const z = myThemes.get(n);
        out.dirs.add(n);
        for (const [rel, b] of z.files) {
          const segs = rel.split('/');
          for (let i = 1; i < segs.length; i++) out.dirs.add(n + '/' + segs.slice(0, i).join('/'));
          out.files.set(n + '/' + rel, { m: z.at, s: b.length });
        }
      }
      mineWins = wins;
      return out;
    },
    async readBytes(rel, { max = Infinity } = {}) {
      const n = rel.split('/')[0], z = myThemes.get(n);
      if (z && mineWins.has(n)) {
        const b = z.files.get(rel.slice(n.length + 1));
        if (!b) throw Object.assign(new Error('ENOENT: ' + rel), { code: 'ENOENT' });
        if (b.length > max) throw new ReadOverError(b.length, max, rel);
        return b.slice();
      }
      if (!folderWs) throw Object.assign(new Error('ENOENT: ' + rel), { code: 'ENOENT' });
      return folderWs.readBytes(rel, { max });
    },
  };
  return w;
}
// 作業場所のテーマの名前（<名前>/tokens.css があるもの）と見せる名前（theme.json の title・name、なければ名前。60 字まで）
export async function themeNamesOf(ws) {
  const L = await ws.list();
  return [...L.files.keys()].filter((r) => /^[^/]+\/tokens\.css$/.test(r)).map((r) => r.split('/')[0]).sort();
}
export async function themeLabelOf(ws, name) {
  try {
    const j = JSON.parse(new TextDecoder().decode(await ws.readBytes(name + '/theme.json', { max: JSON_MAX })));
    const t = [j && j.title, j && j.name].find((x) => typeof x === 'string' && x.trim());
    return t ? t.trim().slice(0, 60) : name;
  } catch { return name; }
}

// ---------------------------------------------------------------- IndexedDB（テーマの名前ごとに 'my:<名前>'）
const KEY = 'my:', RANGE = () => IDBKeyRange.bound(KEY, KEY + '\uffff');
const okFiles = (files) => files instanceof Map && files.has('tokens.css') && [...files].every(([k, v]) => typeof k === 'string' && v instanceof Uint8Array);
export async function loadMyThemes() {
  const out = new Map();
  try {
    for (const v of (await themeDbTx('readonly', (s) => s.getAll(RANGE()))) || []) {
      if (!v || typeof v.name !== 'string' || !RE.registryName.test(v.name) || !okFiles(v.files)) continue;
      out.set(v.name, { files: v.files, at: Number(v.at) || 0, source: String(v.source || ''), from: String(v.from || '') });
    }
  } catch { /* 使えない */ }
  return out;
}
export async function putMyTheme(name, files, { source = '', from = '', at = Date.now() } = {}) {
  if (!RE.registryName.test(name) || !okFiles(files)) throw new TypeError(`putMyTheme: bad theme "${name}"`);
  const rec = { name, files, at, source, from };
  try { await themeDbTx('readwrite', (s) => s.put(rec, KEY + name)); } catch { return null; }
  return rec;
}
export async function forgetMyThemes() {
  try { await themeDbTx('readwrite', (s) => s.delete(RANGE())); return true; } catch { return false; }
}
