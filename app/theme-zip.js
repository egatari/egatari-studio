// テーマの zip（showDirectoryPicker のない Safari・Firefox・iPad でも、テーマのフォルダの代わりに使える）。zip はダウンロード物：信頼しない
//   readThemeZip(bytes, zipName) → Map<名前, Map<テーマの中の場所, Uint8Array>>
//     zip の中の深さ THEME_ZIP_LIMITS.depth までのどこでも、tokens.css を持つフォルダを 1 つのテーマとする（GitHub の「Download ZIP」の
//     <repo>-main/themes/<名前>/ も）。いくつあってもすべて。名前はフォルダの名前（zip の最上位に tokens.css があれば zip の名前）で、
//     部品庫・テーマ庫の名前の決まり（RE.registryName）に合わなければ断る。読むのは tokens.css・theme.json・theme.json の logos・最上位の LICENSE* だけ
//     （ほかは読まない）。中身は kit/core/zip-read.mjs が上限つきで読む。..・絶対パス・シンボリックリンクの項目が 1 つでもあれば zip ごと断る
//   取り出したテーマは「自分のテーマ」の置き場所（app/my-themes.js。IndexedDB）に source: 'zip' で入れる
//   pickZipFile() → File | null
import { readZip, ZipError } from '../kit/core/zip-read.mjs';
import { ReadOverError, READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { RE } from '../kit/core/portable.mjs';
import { excludedFromThemeHash, isThemeLicense } from '../kit/core/themes-lock.mjs';

const KiB = 1024, MiB = 1048576;
export const THEME_ZIP_LIMITS = Object.freeze({
  zipBytes: READ_LIMITS.default,   // zip のファイル（読む前に File.size で）
  members: 3000,                   // 項目の数（フォルダの一覧の MAX_FILES と同じ）
  total: 16 * MiB,                 // 取り出すものの合計
  tokens: 4 * MiB, json: 64 * KiB, logo: 4 * MiB, license: 256 * KiB,
  depth: 5,                        // テーマのフォルダの深さ（zip の最上位から）
  themes: 64,                      // 1 つの zip のテーマの数
});

// code：'too-large' | 'broken' | 'no-theme' | 'refused'（entry：断った項目、why：'path' | 'link' | 'name' | 'dup'）
export class ThemeZipError extends Error {
  constructor(code, msg, extra = {}) { super(msg); this.name = 'ThemeZipError'; this.code = code; Object.assign(this, extra); }
}
const refused = (entry, why) => new ThemeZipError('refused', `refused ZIP file entry: ${entry} (${why})`, { entry, why });
// zip-read と読み取りの誤りを、知らせの 4 つに分ける
export function themeZipErrorKind(e) {
  if (e instanceof ThemeZipError) return e.code;
  if (e instanceof ReadOverError || (e && e.code === 'read-over')) return 'too-large';
  if (e instanceof ZipError) return e.code === 'zip-over' || e.code === 'zip-members' ? 'too-large' : 'broken';
  return 'broken';
}

// 項目の名前を確かめる → 区切った名前の並び。.. ・絶対パス・\ ・NUL は断る（zip ごと）
function segmentsOf(name) {
  if (/[\\\0]/.test(name) || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw refused(name, 'path');
  const segs = name.split('/');
  if (segs.some((s) => s === '..' || s === '.' || s === '')) throw refused(name, 'path');
  return segs;
}
// 読まない場所：ドットで始まる名前、macOS の「圧縮」が足す __MACOSX/
const hidden = (segs) => segs.some((s) => s.startsWith('.') || s === '__MACOSX');
const capOf = (base) => (base === 'tokens.css' ? THEME_ZIP_LIMITS.tokens : base === 'theme.json' ? THEME_ZIP_LIMITS.json : isThemeLicense(base) ? THEME_ZIP_LIMITS.license : THEME_ZIP_LIMITS.logo);

// テーマのフォルダの中の相対パス（theme.json の logos）を zip の中の名前にする。フォルダの外に出るもの・文書は null（組み立ても読まない）
function inside(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.startsWith('/') || /[\\\0]/.test(rel) || excludedFromThemeHash(rel)) return null;
  const out = [];
  for (const s of rel.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (!out.length) return null; out.pop(); } else out.push(s);
  }
  return out.length ? (dir ? dir + '/' : '') + out.join('/') : null;
}

export async function readThemeZip(bytes, zipName = '') {
  const L = THEME_ZIP_LIMITS;
  const check = (name, symlink) => {
    const segs = segmentsOf(name);
    if (symlink) throw refused(name, 'link');
    return segs;
  };
  // 1 回目：tokens.css・theme.json・LICENSE*（テーマのフォルダの最上位にあるものだけが使われる）
  const first = (name, { symlink }) => {
    const segs = check(name, symlink);
    if (hidden(segs) || segs.length - 1 > L.depth) return false;
    const base = segs[segs.length - 1];
    return base === 'tokens.css' || base === 'theme.json' || isThemeLicense(base);
  };
  let r1;
  try { r1 = await readZip(bytes, { maxMembers: L.members, maxTotalBytes: L.total, accept: first, maxMemberBytes: (n) => capOf(n.split('/').pop()) }); }
  catch (e) { throw wrap(e); }
  const dirOf = (n) => n.split('/').slice(0, -1).join('/');
  const dirs = [...r1.files.keys()].filter((n) => n.split('/').pop() === 'tokens.css').map(dirOf).sort();
  if (!dirs.length) throw new ThemeZipError('no-theme', 'no theme (<name>/tokens.css) in the ZIP file');
  if (dirs.length > L.themes) throw new ThemeZipError('too-large', `too many themes (${dirs.length}; at most ${L.themes})`);
  const themes = new Map(), dirName = new Map();
  for (const d of dirs) {
    const name = d ? d.split('/').pop() : String(zipName).replace(/^.*[\\/]/, '').replace(/\.zip$/i, '');
    if (!RE.registryName.test(name)) throw refused((d ? d + '/' : '') + 'tokens.css', 'name');
    if (themes.has(name)) throw refused((d ? d + '/' : '') + 'tokens.css', 'dup');
    themes.set(name, new Map()); dirName.set(d, name);
  }
  // テーマのフォルダの最上位のファイルを入れる。2 回目に読むロゴ（theme.json の logos のうち、そのテーマのフォルダの中のもの）
  let used = 0;
  const want = new Map();   // zip の中の名前 → [テーマの名前, テーマの中の場所]
  for (const [n, b] of r1.files) {
    const d = dirOf(n), name = dirName.get(d), base = n.split('/').pop();
    if (!name) continue;
    themes.get(name).set(base, b); used += b.length;
    if (base !== 'theme.json') continue;
    let cfg = null;
    try { cfg = JSON.parse(new TextDecoder().decode(b)); } catch { cfg = null; }   // 読めない theme.json は組み立てが知らせる
    for (const f of cfg && Array.isArray(cfg.logos) ? cfg.logos : []) {
      const z = inside(d, f);
      if (z && !r1.files.has(z)) want.set(z, [name, d ? z.slice(d.length + 1) : z]);
    }
  }
  if (want.size) {
    let r2;
    try { r2 = await readZip(bytes, { maxMembers: L.members, maxTotalBytes: Math.max(1, L.total - used), accept: (n, o) => { check(n, o.symlink); return want.has(n); }, maxMemberBytes: () => L.logo }); }
    catch (e) { throw wrap(e); }
    for (const [z, b] of r2.files) { const [name, rel] = want.get(z); themes.get(name).set(rel, b); }
  }
  return themes;
}
const wrap = (e) => (e instanceof ThemeZipError || e instanceof ZipError ? e : new ThemeZipError('broken', String((e && e.message) || e)));

// zip のファイルを選ぶ（<input type=file>。どのブラウザでも。人の操作の中で呼ぶ）→ File | null（やめたとき）
export function pickZipFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.zip,application/zip,application/x-zip-compressed'; inp.hidden = true;
    const done = (f) => { inp.remove(); resolve(f); };
    inp.addEventListener('change', () => done(inp.files && inp.files[0] ? inp.files[0] : null));
    inp.addEventListener('cancel', () => done(null));
    document.body.append(inp);
    inp.click();
  });
}
