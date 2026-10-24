// 同梱のテーマの版の固定（themes.lock.json。kit/core/themes-lock.mjs）を確かめる・hash を出す
//   node tools/themes-lock.mjs --check     固定のファイルと、今の版（themes/<名前>/）・前の版の写し（vendor/themes/<名前>/<版>/）の hash が合うか（npm test と CI）
//   node tools/themes-lock.mjs --print     テーマごとの今の hash と、写しの版の hash を出す（固定のファイルを手で書くとき）
// hash は書き出し（kit/core/portable.mjs）が index.themes に書くものと同じ：組み立てが読むテーマのファイル（theme.json・tokens.css・ロゴ）の
// 「<相対パス>\t<sha256>\n」をパスの順に並べたものの sha256（字のファイルは改行をそろえる。format spec §6）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { THEMES_LOCK_FILE, VENDOR_THEMES, parseThemesLock, excludedFromThemeHash } from '../kit/core/themes-lock.mjs';
import { identityBytes } from '../kit/core/identity-hash.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const cmpCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// テーマのフォルダの同一性の hash（組み立てが読むファイルだけ。親のテーマ extends は親の hash に入る）。
// 最上位の説明の文書（README*・LICENSE*・*.md。excludedFromThemeHash）は入れない（format spec §6）
export function themeDirSha(dir) {
  const files = [];
  const cfgPath = path.join(dir, 'theme.json');
  let cfg = {};
  if (fs.existsSync(cfgPath)) { files.push('theme.json'); cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
  files.push('tokens.css');
  for (const f of Array.isArray(cfg.logos) ? cfg.logos : []) if (!excludedFromThemeHash(f) && fs.existsSync(path.join(dir, String(f)))) files.push(String(f).split(path.sep).join('/'));
  const lines = [...new Set(files)].sort(cmpCodePoint).map((k) => `${k}\t${sha(identityBytes(k, fs.readFileSync(path.join(dir, ...k.split('/')))))}\n`);
  return sha(lines.join(''));
}
export const themeVersionDir = (root, name, version, current) => (version === current ? path.join(root, 'themes', name) : path.join(root, ...VENDOR_THEMES, name, version));

export function themesLockCheck(root = ROOT) {
  const f = path.join(root, THEMES_LOCK_FILE);
  if (!fs.existsSync(f)) return [`${THEMES_LOCK_FILE} is missing`];
  let lock;
  try { lock = parseThemesLock(fs.readFileSync(f, 'utf8')); } catch (e) { return [e.message]; }
  const e = [];
  // 同梱のテーマはどれも固定のファイルにある（索引の themes[].version はテーマ自身の版。format spec §3.8）
  const td = path.join(root, 'themes');
  if (fs.existsSync(td)) for (const d of fs.readdirSync(td)) if (fs.existsSync(path.join(td, d, 'tokens.css')) && !Object.prototype.hasOwnProperty.call(lock.themes, d)) e.push(`themes/${d} is not in ${THEMES_LOCK_FILE} (every bundled theme records its own version)`);
  for (const [name, t] of Object.entries(lock.themes)) {
    const cfgPath = path.join(root, 'themes', name, 'theme.json');
    const ver = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')).version : undefined;
    // theme.json の version はあってもなくてもよい（kokugo・business は 1.0.0 より前からのバイトのまま：記録した sha256 を変えない）。あれば今の版と同じ
    if (ver !== undefined && ver !== t.current) e.push(`themes/${name}/theme.json: version ${JSON.stringify(ver)} is not the current version ${t.current} in ${THEMES_LOCK_FILE}`);
    for (const v of t.versions) {
      const dir = themeVersionDir(root, name, v, t.current);
      const where = path.relative(root, dir).split(path.sep).join('/');
      if (!fs.existsSync(path.join(dir, 'tokens.css'))) { e.push(`${name} ${v}: ${where}/tokens.css is missing`); continue; }
      const h = themeDirSha(dir);
      if (h !== t.sha256[v]) e.push(`${name} ${v}: ${where} hashes to ${h}, ${THEMES_LOCK_FILE} has ${t.sha256[v]}`);
    }
    // 写しのフォルダに、固定のファイルにない版がないこと
    const vd = path.join(root, ...VENDOR_THEMES, name);
    if (fs.existsSync(vd)) for (const d of fs.readdirSync(vd)) if (!d.startsWith('.') && !t.versions.includes(d)) e.push(`${VENDOR_THEMES.join('/')}/${name}/${d} is not a version in ${THEMES_LOCK_FILE}`);
    if (fs.existsSync(path.join(vd, t.current))) e.push(`${VENDOR_THEMES.join('/')}/${name}/${t.current}: the current version lives in themes/${name}/, not in the copies`);
  }
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--print')) {
    for (const d of fs.readdirSync(path.join(ROOT, 'themes'))) if (fs.existsSync(path.join(ROOT, 'themes', d, 'tokens.css'))) console.log(`themes/${d}\t${themeDirSha(path.join(ROOT, 'themes', d))}`);
    const vd = path.join(ROOT, ...VENDOR_THEMES);
    if (fs.existsSync(vd)) for (const n of fs.readdirSync(vd)) for (const v of fs.readdirSync(path.join(vd, n))) console.log(`${VENDOR_THEMES.join('/')}/${n}/${v}\t${themeDirSha(path.join(vd, n, v))}`);
  } else {
    const e = themesLockCheck();
    if (e.length) { for (const x of e) console.error('themes-lock: ' + x); process.exit(1); }
    console.log(`themes-lock: ${THEMES_LOCK_FILE} matches themes/ and ${VENDOR_THEMES.join('/')}/`);
  }
}
