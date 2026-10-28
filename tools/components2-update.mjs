// 部品庫 2.0（egatari/components v2.x）のリリースを取り込む・写しを確かめる（format spec §6.1：パーツごとの版）
//   node tools/components2-update.mjs v2.0.0-rc.1 [--from <manifest.json と tarball のあるフォルダ>] [--default]
//   node tools/components2-update.mjs --check          写しと components2.lock.json が合っているか（ネットワークなし）
//
// 1.x の取り込み（tools/components-update.mjs、vendor/components/、components.lock.json）とは別に持つ。1.x の教材は 1.x のまま組む。
// 確かめること（1.x と同じ）：manifest の name・version・tag、tarball の sha256 が manifest のものか、tarball の中身が manifest の files と
// ちょうど同じか、各パーツの index.js の同一性の sha256（改行をそろえる）が manifest の components のものか。
// 書くもの：vendor/components-2/<名前>/<パーツの版>/（そのパーツのファイル）、vendor/components-2/LICENSE、
// vendor/components-2/manifest-<カタログの版>.json（バイトのまま）、components2.lock.json（kit/core/parts2.mjs）。
// 同じパーツの同じ版がもうあれば、中身が同じことを確かめて書かない（違えば断る：版は付け替えない約束）。
// 既定のカタログ（default）は、初めての取り込みか --default のときだけ変える（教材は既定で 1.x のまま。2.0 を選ぶのは教材の設定）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readTarGz, safePath } from './components-tar.mjs';
import { identityBytes, normalizeEol } from '../kit/core/identity-hash.mjs';
import { LOCK2_FILE, VENDOR_PARTS2, lock2Problems } from '../kit/core/parts2.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SOURCE = 'https://github.com/egatari/components';
const PACKAGE = 'egatari-components';
const MAX = 64 * 1024 * 1024;
const TAG_RE = /^v(2\.\d+\.\d+(?:-[0-9a-z][0-9a-z.-]{0,31})?)$/;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

export function verifyRelease2(tag, manifestBytes, tarball) {
  const tm = TAG_RE.exec(tag);
  if (!tm) throw new Error(`${tag}: not a 2.x release tag v2.Y.Z[-pre]`);
  const version = tm[1];
  let m;
  try { m = JSON.parse(new TextDecoder().decode(manifestBytes)); } catch (e) { throw new Error(`manifest.json: ${e.message}`); }
  if (!isObj(m) || m.name !== PACKAGE) throw new Error(`manifest.json: name is not ${PACKAGE}`);
  if (m.version !== version || m.tag !== tag) throw new Error(`manifest.json: version ${m.version} / tag ${m.tag}, expected ${version} / ${tag}`);
  if (!isObj(m.tarball) || !/^[0-9a-f]{64}$/.test(m.tarball.sha256 || '')) throw new Error('manifest.json: no tarball.sha256');
  const tsha = sha(tarball);
  if (tsha !== m.tarball.sha256) throw new Error(`tarball sha256 ${tsha} does not match manifest.json (${m.tarball.sha256})`);
  if (!isObj(m.files) || !isObj(m.components)) throw new Error('manifest.json: no files or components');
  const files = readTarGz(tarball, { maxBytes: MAX });
  for (const p of Object.keys(m.files)) if (!files.has(p)) throw new Error(`tarball: ${p} is in manifest.json but not in the tarball`);
  for (const [p, b] of files) {
    if (!Object.prototype.hasOwnProperty.call(m.files, p)) throw new Error(`tarball: ${p} is not in manifest.json`);
    if (sha(identityBytes(p, b)) !== m.files[p]) throw new Error(`tarball: ${p} does not match its sha256 in manifest.json`);
  }
  const parts = {};
  for (const [name, c] of Object.entries(m.components)) {
    if (!NAME_RE.test(name)) throw new Error(`manifest.json: part "${name}" is not a registry name`);
    if (!isObj(c) || typeof c.version !== 'string') throw new Error(`manifest.json: components.${name} has no version`);
    const idx = files.get(`${name}/index.js`);
    if (!idx) throw new Error(`tarball: ${name}/index.js is missing`);
    if (sha(normalizeEol(idx)) !== c.sha256) throw new Error(`manifest.json: components.${name}.sha256 does not match ${name}/index.js`);
    const kind = c.kind === 'library' ? 'library' : 'element';
    parts[name] = {
      version: c.version,
      record: { sha256: c.sha256, kind, ...(kind === 'element' ? { tag: c.tag } : {}), requires: isObj(c.requires) ? c.requires : {},
        ...(isObj(c.build) ? { build: c.build } : {}), ...(typeof c.glyphs === 'string' ? { glyphs: c.glyphs } : {}), license: typeof c.license === 'string' ? c.license : (m.license || 'MIT') },
      files: new Map(),
    };
  }
  let license = null;
  for (const [p, b] of files) {
    if (p === 'LICENSE') { license = b; continue; }
    const name = p.split('/')[0];
    if (!parts[name]) throw new Error(`tarball: ${p} is not in a part of manifest.json`);
    parts[name].files.set(p.slice(name.length + 1), b);
  }
  return { tag, version, tarballSha256: tsha, manifest: manifestBytes, license, parts };
}

function listFiles(dir, rel = '') {
  const out = [];
  for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isSymbolicLink()) throw new Error(`${path.join(dir, r)}: symbolic link`);
    if (d.isDirectory()) out.push(...listFiles(dir, r)); else out.push(r);
  }
  return out.sort();
}

export function applyRelease2(rel, { root = ROOT, makeDefault = false } = {}) {
  const base = path.join(root, ...VENDOR_PARTS2);
  const lockFile = path.join(root, LOCK2_FILE);
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : { source: SOURCE, default: rel.version, catalogues: {}, parts: {} };
  const prev = lock.catalogues[rel.version];
  if (prev && prev.tarballSha256 !== rel.tarballSha256) throw new Error(`${rel.tag} was imported before with tarball sha256 ${prev.tarballSha256}; now ${rel.tarballSha256}. Ask the components maintainer (a moved tag must not change what an imported catalogue means)`);
  const plan = [];
  for (const [name, p] of Object.entries(rel.parts)) {
    const dest = path.join(base, name, p.version);
    const had = lock.parts[name] && lock.parts[name][p.version];
    if (had && had.sha256 !== p.record.sha256) throw new Error(`${name}@${p.version} is already vendored with index.js sha256 ${had.sha256}; this release has ${p.record.sha256}. A part version is never replaced`);
    if (fs.existsSync(dest)) {
      const have = listFiles(dest), want = [...p.files.keys()].sort();
      // 同じ版の写しがある：index.js が同じなら残す（ほかのファイル（README・demo）はカタログの間で変わってよい。index.js だけが同一性）
      if (!fs.existsSync(path.join(dest, 'index.js')) || sha(normalizeEol(fs.readFileSync(path.join(dest, 'index.js')))) !== p.record.sha256) throw new Error(`vendor/components-2/${name}/${p.version} exists with a different index.js`);
      if (have.join('\n') === want.join('\n')) continue;
    }
    for (const f of p.files.keys()) if (safePath(f)) throw new Error(`${name}/${f}: ${safePath(f)}`);
    plan.push([name, dest, p]);
  }
  for (const [, dest, p] of plan) {
    const tmp = dest + '.tmp-' + process.pid;
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [f, b] of p.files) { const out = path.join(tmp, ...f.split('/')); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, b); }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmp, dest);
  }
  fs.mkdirSync(base, { recursive: true });
  if (rel.license) fs.writeFileSync(path.join(base, 'LICENSE'), rel.license);
  fs.writeFileSync(path.join(base, `manifest-${rel.version}.json`), rel.manifest);
  lock.source = SOURCE;
  lock.catalogues[rel.version] = { tag: rel.tag, tarballSha256: rel.tarballSha256, manifestSha256: sha(rel.manifest),
    parts: Object.fromEntries(Object.keys(rel.parts).sort().map((n) => [n, rel.parts[n].version])) };
  for (const [name, p] of Object.entries(rel.parts)) (lock.parts[name] ||= {})[p.version] = p.record;
  if (makeDefault || !lock.default || !lock.catalogues[lock.default]) lock.default = rel.version;
  const ordered = {
    source: lock.source, default: lock.default,
    catalogues: Object.fromEntries(Object.keys(lock.catalogues).sort().map((k) => [k, lock.catalogues[k]])),
    parts: Object.fromEntries(Object.keys(lock.parts).sort().map((n) => [n, Object.fromEntries(Object.keys(lock.parts[n]).sort().map((v) => [v, lock.parts[n][v]]))])),
  };
  const problems = lock2Problems(ordered);
  if (problems.length) throw new Error(`${LOCK2_FILE}: ${problems.join('; ')}`);
  fs.writeFileSync(lockFile, JSON.stringify(ordered, null, 2) + '\n');
  return { written: plan.map(([n, , p]) => `${n}@${p.version}`), parts: Object.keys(rel.parts).length };
}

export function checkVendor2(root = ROOT) {
  const e = [];
  const lockFile = path.join(root, LOCK2_FILE);
  if (!fs.existsSync(lockFile)) return [];   // 2.0 を取り込んでいない枝
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch (err) { return [`${LOCK2_FILE}: ${err.message}`]; }
  e.push(...lock2Problems(lock).map((x) => `${LOCK2_FILE}: ${x}`));
  if (e.length) return e;
  if (lock.source !== SOURCE) e.push(`${LOCK2_FILE}: source is ${lock.source}, expected ${SOURCE}`);
  const base = path.join(root, ...VENDOR_PARTS2);
  for (const [name, vs] of Object.entries(lock.parts)) {
    for (const [v, p] of Object.entries(vs)) {
      const f = path.join(base, name, v, 'index.js');
      if (!fs.existsSync(f)) { e.push(`vendor/components-2/${name}/${v}/index.js is missing`); continue; }
      if (fs.lstatSync(f).isSymbolicLink()) { e.push(`vendor/components-2/${name}/${v}/index.js is a symbolic link`); continue; }
      if (sha(normalizeEol(fs.readFileSync(f))) !== p.sha256) e.push(`vendor/components-2/${name}/${v}/index.js does not match ${LOCK2_FILE}`);
      try { listFiles(path.join(base, name, v)); } catch (err) { e.push(err.message); }
    }
  }
  for (const d of fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : []) {
    if (!d.isDirectory()) {
      const m = /^manifest-(.+)\.json$/.exec(d.name);
      if (m) {
        const c = lock.catalogues[m[1]];
        if (!c) e.push(`vendor/components-2/${d.name}: not a catalogue in ${LOCK2_FILE}`);
        else if (sha(fs.readFileSync(path.join(base, d.name))) !== c.manifestSha256) e.push(`vendor/components-2/${d.name} does not match ${LOCK2_FILE} manifestSha256`);
      } else if (d.name !== 'LICENSE') e.push(`vendor/components-2/${d.name}: not expected`);
      continue;
    }
    if (!lock.parts[d.name]) { e.push(`vendor/components-2/${d.name}: not in ${LOCK2_FILE}`); continue; }
    for (const v of fs.readdirSync(path.join(base, d.name))) if (!lock.parts[d.name][v]) e.push(`vendor/components-2/${d.name}/${v}: not in ${LOCK2_FILE}`);
  }
  for (const cv of Object.keys(lock.catalogues)) if (!fs.existsSync(path.join(base, `manifest-${cv}.json`))) e.push(`vendor/components-2/manifest-${cv}.json is missing`);
  if (!fs.existsSync(path.join(base, 'LICENSE'))) e.push('vendor/components-2/LICENSE is missing');
  return e;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const b = new Uint8Array(await res.arrayBuffer());
  if (b.length > MAX) throw new Error(`${url}: larger than ${MAX} bytes`);
  return b;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--check') {
      const e = checkVendor2();
      for (const x of e) console.log('FAIL ' + x);
      if (e.length) process.exit(1);
      const f = path.join(ROOT, LOCK2_FILE);
      if (!fs.existsSync(f)) { console.log(`components 2: no ${LOCK2_FILE}`); process.exit(0); }
      const lock = JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log(`components 2: catalogues ${Object.keys(lock.catalogues).join(', ')} (default ${lock.default}); ${Object.keys(lock.parts).length} parts; vendor/components-2 matches ${LOCK2_FILE}`);
    } else {
      const fi = args.indexOf('--from');
      const from = fi >= 0 ? path.resolve(args[fi + 1]) : null;
      const tag = args.find((a, i) => !a.startsWith('--') && !(fi >= 0 && i === fi + 1));
      if (!tag || !TAG_RE.test(tag)) { console.error('usage: node tools/components2-update.mjs v2.Y.Z[-pre] [--from <folder>] [--default]\n       node tools/components2-update.mjs --check'); process.exit(2); }
      const file = `${PACKAGE}-${tag}.tar.gz`;
      let manifest, tarball;
      if (from) { manifest = fs.readFileSync(path.join(from, 'manifest.json')); tarball = fs.readFileSync(path.join(from, file)); }
      else {
        const url = `${SOURCE}/releases/download/${tag}`;
        console.log(`downloading ${url}/manifest.json and ${file}`);
        manifest = await download(`${url}/manifest.json`);
        tarball = await download(`${url}/${file}`);
      }
      const rel = verifyRelease2(tag, manifest, tarball);
      const r = applyRelease2(rel, { makeDefault: args.includes('--default') });
      console.log(`${tag}: tarball sha256 ${rel.tarballSha256} (matches manifest.json; ${r.parts} parts, every file checked)`);
      if (r.written.length) console.log(`  written: ${r.written.join(', ')}`);
      console.log(`  ${LOCK2_FILE} updated`);
    }
  } catch (e) {
    console.error(`components 2: ${e.message}`);
    process.exit(1);
  }
}
