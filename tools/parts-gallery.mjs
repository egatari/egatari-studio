// パーツのサンプルのページ（backlog #158）：パーツライブラリ 2.x の 1 つの版の gallery（すべてのパーツの動くサンプルを、伝えたいことごとに並べた 1 つの教材）を、
// 取り込んだ写し（vendor/components/sha256/・vendor/components-2/manifest-<版>.json）だけから組む。git もネットワークも使わない
//   node tools/parts-gallery.mjs -o <dir> [--catalogue X.Y.Z] [--previous X.Y.Z|none] [--tool <gallery.mjs>]
//       <dir>/index.html（組んだ 1 つの HTML）を書く。--catalogue の既定は components2.lock.json の default、--previous の既定はその前の版
//       （カタログの版の比較で「新しい・変わった・サンプルが変わった」の印が付く）。--tool はパーツライブラリの checkout の tools/gallery.mjs を使う（試すとき。写しを確かめない）
//   node tools/parts-gallery.mjs --verify          写し（vendor/components-gallery/）が SOURCE.json のファイルと sha256 に合うか（ネットワークなし。npm run gen:check）
//   node tools/parts-gallery.mjs --sync <checkout>  パーツライブラリの checkout（tools/gallery.mjs のある決まったコミット）から写しを取り直し、SOURCE.json を書く（管理者の道具）
// 組み立ての道具（gallery.mjs --pack）はパーツライブラリ egatari/components のもの。Studio には、決まったコミットの写しを vendor/components-gallery/ に持つ
// （gallery.mjs とそれが読み込むファイル。--pack は npm の依存を読み込まない）。リリースのタグの写しだけから
// （npm ci のほかにネットワークなしで）組めるので、pages のワークフローと site-versions.mjs asset（タグの worktree で build-app）が同じものを組む。
// 公開の場所（tools/build-app.mjs --parts、tools/site-versions.mjs assemble）：/parts/v<カタログの版>/index.html と /parts/index.html（版の一覧）、
// /parts/versions.json（{current, versions}）。一度公開した版は、最初に公開したリリースの写しのまま残す（凍結）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveComponent } from '../kit/core/components-lock.mjs';
import { VENDOR_PARTS2, LOCK2_FILE } from '../kit/core/parts2.mjs';
import { cmpVersion } from '../app/version-ui.js';
import { PARTS_DIR, partsGalleryUrl } from '../app/parts-gallery.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const TOOL_DIR = path.join(ROOT, 'vendor', 'components-gallery');
const SOURCE = path.join(TOOL_DIR, 'SOURCE.json');
// 写しに入れるファイル（gallery.mjs と、それが import するもの。--pack は git・.studio・ブラウザを使わないが、import は静かに解決される必要がある）
export const TOOL_FILES = ['LICENSE', 'tools/gallery.mjs', 'tools/studio.mjs', 'tools/studio.json', 'tools/baseline.mjs', 'tools/parts.mjs', 'tools/tar.mjs',
  'tools/identity.mjs', 'tools/lint.mjs', 'tools/katex-produce.mjs', 'tools/subset-produce.mjs'];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RELEASE = /^\d+\.\d+\.\d+$/;
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// 写しが SOURCE.json と合うか → 問題の一覧（空なら合う）
export function toolProblems() {
  if (!fs.existsSync(SOURCE)) return [`${path.relative(ROOT, SOURCE)} is missing`];
  const src = readJson(SOURCE), bad = [];
  if (!/^[0-9a-f]{40}$/.test(src.commit || '')) bad.push('SOURCE.json: commit is not a full sha');
  const files = src.files || {};
  for (const f of TOOL_FILES) if (!(f in files)) bad.push(`SOURCE.json: ${f} is not listed`);
  for (const [f, want] of Object.entries(files)) {
    const p = path.join(TOOL_DIR, ...f.split('/'));
    if (!fs.existsSync(p)) bad.push(`${f}: missing`);
    else if (sha256(fs.readFileSync(p)) !== want) bad.push(`${f}: sha256 differs from SOURCE.json (do not edit the copy; run --sync from the components repository)`);
  }
  const listed = new Set(Object.keys(files));
  const walk = (d, rel = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), rel + e.name + '/') : [rel + e.name]));
  for (const f of walk(TOOL_DIR)) if (f !== 'SOURCE.json' && !listed.has(f)) bad.push(`${f}: not in SOURCE.json`);
  return bad;
}

// 取り込んだカタログ → {version, manifest（パス）, lock2}。manifest のバイトが components2.lock.json の manifestSha256 と合うか確かめる
function catalogueOf(lock2, version) {
  const c = lock2.catalogues[version];
  if (!c) throw new Error(`parts library ${version} is not in ${LOCK2_FILE} (catalogues: ${Object.keys(lock2.catalogues).join(', ')})`);
  const file = path.join(ROOT, ...VENDOR_PARTS2, `manifest-${version}.json`);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing`);
  if (c.manifestSha256 && sha256(fs.readFileSync(file)) !== c.manifestSha256) throw new Error(`${path.relative(ROOT, file)} does not match manifestSha256 in ${LOCK2_FILE}`);
  return file;
}
// 前の版：取り込んだカタログのうち、version より前で最も新しいリリース（候補 -rc… は除く）。なければ null
export function previousCatalogue(lock2, version) {
  const older = Object.keys(lock2.catalogues).filter((v) => RELEASE.test(v) && cmpVersion(v, version) > 0).sort(cmpVersion);   // cmpVersion：新しい順
  return older.length ? older[0] : null;
}

// manifest の files を、写し（components.lock.json の content 表が指す vendor/components/sha256/<hash>/）から dir に並べる（展開した tarball と同じ形）
export function packFolder(manifestFile, dir) {
  const lock = readJson(path.join(ROOT, 'components.lock.json'));
  const m = readJson(manifestFile);
  for (const f of Object.keys(m.files)) {
    let src;
    if (f === 'LICENSE') src = path.join(ROOT, ...VENDOR_PARTS2, 'LICENSE');
    else {
      const [name, ...rest] = f.split('/');
      const c = m.components[name];
      const d = c ? resolveComponent(path, ROOT, lock, name, c.version) : null;
      if (!d) throw new Error(`${f}: ${name}${c ? ' ' + c.version : ''} is not in the vendored parts (components.lock.json)`);
      src = path.join(d, ...rest);
    }
    if (!fs.existsSync(src)) throw new Error(`${f}: not in the vendored copy (${path.relative(ROOT, src)})`);
    const to = path.join(dir, ...f.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
  }
  return Object.keys(m.files).length;
}

// gallery の教材（作業フォルダ：deck.html と egatari.json）を work に書く → {catalogue, previous, parts, groups, slides, work}
export function galleryDeck({ work, catalogue, previous, tool } = {}) {
  const lock2 = readJson(path.join(ROOT, LOCK2_FILE));
  const version = catalogue || lock2.default;
  const manifest = catalogueOf(lock2, version);
  const prev = previous === 'none' ? null : previous || previousCatalogue(lock2, version);
  const prevManifest = prev ? catalogueOf(lock2, prev) : null;
  const script = tool ? path.resolve(tool) : path.join(TOOL_DIR, 'tools', 'gallery.mjs');
  if (!tool) { const bad = toolProblems(); if (bad.length) throw new Error('vendor/components-gallery does not match SOURCE.json:\n  ' + bad.join('\n  ')); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-parts-pack-'));
  try {
    const pack = path.join(tmp, 'pack');
    packFolder(manifest, pack);
    fs.rmSync(work, { recursive: true, force: true });
    const said = execFileSync(process.execPath, [script, '--pack', pack, '--manifest', manifest, ...(prevManifest ? ['--previous', prevManifest] : []), '-o', work],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const m = /(\d+) parts in (\d+) groups, (\d+) slides/.exec(said);
    if (!m || !fs.existsSync(path.join(work, 'deck.html'))) throw new Error(`gallery.mjs --pack did not write a deck: ${said.trim()}`);
    const conf = readJson(path.join(work, 'egatari.json'));
    if (conf.componentsCatalogue !== version) throw new Error(`gallery.mjs wrote componentsCatalogue ${conf.componentsCatalogue}, expected ${version}`);
    return { catalogue: version, previous: prev, parts: +m[1], groups: +m[2], slides: +m[3], work };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 組む：out/index.html（kit/build.mjs で組んだ 1 つの HTML）→ {catalogue, previous, slides, parts, groups, file, bytes}
export function buildPartsGallery({ out, catalogue, previous, tool, log = console.log } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-parts-gallery-'));
  try {
    const g = galleryDeck({ work: path.join(tmp, 'work'), catalogue, previous, tool });
    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, 'index.html');
    execFileSync(process.execPath, [path.join(ROOT, 'kit', 'build.mjs'), path.join(g.work, 'deck.html'), '-o', file], { stdio: ['ignore', 'ignore', 'inherit'] });
    const bytes = fs.statSync(file).size;
    const r = { ...g, work: undefined, file, bytes };
    log(`parts gallery v${r.catalogue}${r.previous ? ` (marks against v${r.previous})` : ''}: ${r.parts} parts in ${r.groups} groups, ${r.slides} slides, ${(bytes / 1048576).toFixed(1)} MB -> ${file}`);
    return r;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 版の一覧（/parts/index.html と /parts/versions.json）
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// current：いまの編集アプリ（サイトの根）が使う版。versions：置いてある版（新しい順に並べ、current を先に）
export function partsIndexHtml({ current, versions }) {
  const list = [...new Set(versions)].sort(cmpVersion);   // 新しい順
  const order = current && list.includes(current) ? [current, ...list.filter((v) => v !== current)] : list;
  const item = (v) => `<li><a href="v${esc(v)}/">v${esc(v)}</a>${v === current ? ' <span class="cur">いまの編集アプリの版 / Current</span>' : ''}</li>`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'">
<title>パーツのサンプル / Samples of parts — Egatari Studio</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d9dde5;--link:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--fg:#e8ebf1;--muted:#a3abba;--line:#323844;--link:#8fb3ff}}
body{margin:0 auto;max-width:44rem;padding:32px 16px;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:.25rem 0;color:var(--muted)}a{color:var(--link)}
ul{list-style:none;padding:0;margin:1.5rem 0;border-top:1px solid var(--line)}li{padding:.6rem 0;border-bottom:1px solid var(--line);font-size:1.1rem}
.cur{font-size:.85rem;color:var(--muted);margin-left:.5rem}
</style>
</head>
<body>
<h1>パーツのサンプル / Samples of parts</h1>
<p>パーツライブラリの版ごとに、すべてのパーツの動くサンプルを、伝えたいことごとに並べています。→ で段階を進めます。</p>
<p lang="en">Working samples of every part, for each version of the parts library, grouped by what to convey. Press → to step through.</p>
<ul>
${order.map(item).join('\n')}
</ul>
<p><a href="../">Egatari Studio</a></p>
</body>
</html>
`;
}
// site/parts/ の版のフォルダから一覧を書く（current がなければ最も新しい版。from：版 → 公開した Studio の版、わかれば）→ {current, versions}
export function writePartsIndex(site, current = null, from = null) {
  const dir = path.join(site, PARTS_DIR);
  const versions = fs.existsSync(dir) ? fs.readdirSync(dir).map((e) => /^v(\d+\.\d+\.\d+)$/.exec(e)).filter(Boolean).map((m) => m[1])
    .filter((v) => fs.existsSync(path.join(dir, 'v' + v, 'index.html'))).sort((a, b) => cmpVersion(b, a)) : [];   // 古い順
  if (!versions.length) return null;
  const cur = current && versions.includes(current) ? current : versions[versions.length - 1];
  fs.writeFileSync(path.join(dir, 'index.html'), partsIndexHtml({ current: cur, versions }));
  const studio = from ? Object.fromEntries(versions.filter((v) => from[v]).map((v) => [v, from[v]])) : null;
  fs.writeFileSync(path.join(dir, 'versions.json'), JSON.stringify({ current: cur, versions, ...(studio ? { studio } : {}) }, null, 1) + '\n');
  return { current: cur, versions };
}
// site/parts/versions.json の current（いまの組み立てが置いた版）。なければ null
export function partsCurrent(site) {
  try { return readJson(path.join(site, PARTS_DIR, 'versions.json')).current || null; } catch { return null; }
}

// ---------------------------------------------------------------- 写しを取り直す（管理者の道具）
function sync(checkout) {
  const from = path.resolve(checkout);
  const git = (...a) => execFileSync('git', ['-C', from, ...a], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain', '--', ...TOOL_FILES)) throw new Error(`${from}: the gallery files have local changes; check out a pushed commit`);
  const repository = git('remote', 'get-url', 'origin').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  fs.rmSync(TOOL_DIR, { recursive: true, force: true });
  const files = {};
  for (const f of TOOL_FILES) {
    const b = fs.readFileSync(path.join(from, ...f.split('/')));
    const to = path.join(TOOL_DIR, ...f.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, b);
    files[f] = sha256(b);
  }
  fs.writeFileSync(SOURCE, JSON.stringify({ repository, commit, files,
    note: 'Copied by tools/parts-gallery.mjs --sync from that commit of egatari/components (tools/gallery.mjs --pack and the files it imports). Do not edit; change the components repository and sync again.' }, null, 2) + '\n');
  console.log(`vendor/components-gallery: ${TOOL_FILES.length} files from ${repository} ${commit}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (args.includes('--verify')) {
      const bad = toolProblems();
      const src = fs.existsSync(SOURCE) ? readJson(SOURCE) : {};
      if (bad.length) { console.error('vendor/components-gallery:\n  ' + bad.join('\n  ')); process.exit(1); }
      console.log(`vendor/components-gallery matches SOURCE.json (${src.repository} ${src.commit})`);
    } else if (opt('--sync')) sync(opt('--sync'));
    else if (opt('-o')) {
      const r = buildPartsGallery({ out: path.resolve(opt('-o')), catalogue: opt('--catalogue'), previous: opt('--previous'), tool: opt('--tool') });
      console.log(`(on the site: ${partsGalleryUrl(r.catalogue)})`);
    } else { console.error('usage: node tools/parts-gallery.mjs -o <dir> [--catalogue X.Y.Z] [--previous X.Y.Z|none] [--tool <gallery.mjs>] | --verify | --sync <components checkout>'); process.exit(2); }
  } catch (e) { console.error(e.message || e); process.exit(1); }
}
