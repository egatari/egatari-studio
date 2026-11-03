// 部品庫 2.0（egatari/components v2.x）のリリースを取り込む・写しを確かめる（format spec §6.1：パーツごとの版）
//   node tools/components2-update.mjs v2.0.0 [--from <manifest.json と tarball のあるフォルダ>] [--default]
//   node tools/components2-update.mjs --check          写しと components2.lock.json が合っているか（ネットワークなし）
//
// 1.x の取り込み（tools/components-update.mjs、vendor/components/、components.lock.json）とは別に持つ。1.x の教材は 1.x のまま組む。
// 確かめること（1.x と同じ）：manifest の name・version・tag、tarball の sha256 が manifest のものか、tarball の中身が manifest の files と
// ちょうど同じか、各パーツの index.js の同一性の sha256（改行をそろえる）が manifest の components のものか。
// 書くもの：vendor/components/sha256/<hash>/（components.lock.json の content 表で引く）、vendor/components-2/LICENSE、
// vendor/components-2/manifest-<カタログの版>.json（バイトのまま）、components2.lock.json（kit/core/parts2.mjs）。
// 同じパーツの同じ版がもうあれば：index.js の同一性の sha256（manifest の components.<名前>.sha256）が前と同じなら、ほかのファイル
// （README・demo など）だけが違っても受け入れ、このリリースのバイトの写しを別に置く（「refreshed」と出す。版は付け替えていない：index.js は
// 同じ、変わるのは参考・見本の文書だけ）。どの写しを使うかはカタログごとに components2.lock.json の catalogues.<版>.content に書く：
// 前に取り込んだカタログは前のリリースのバイトのまま（そのカタログの manifest の files と合う。凍結した gallery もそのまま組める）。
// components.lock.json の content.<版>（組み立てが index.js を読む写し）は最初に取り込んだときのまま変えない（組んだ教材のバイトを変えない）。
// どのカタログも使わなくなった写しは消さない（取り込みは足すだけ）。index.js の sha256 が前と違えば断る（版を付け替えずに中身を
// 変えた部品庫側の誤り。format spec §6.1）。どちらで決めるかは常にファイルの中身の sha256（manifest.json の各ファイルの値、format spec §6）
// から作った hash で、部品庫がどこかに書くかもしれない「無印の版替え」の印など、申告には頼らない。
// 既定のカタログ（default）は、初めての取り込みか --default のときだけ変える（教材は既定で 1.x のまま。2.0 を選ぶのは教材の設定）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { contentHash } from './components-update.mjs';
import { LOCK_FILE, parseLock, resolveComponent, vendorDir } from '../kit/core/components-lock.mjs';
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
  const contentFile = path.join(root, LOCK_FILE);
  const contentLock = fs.existsSync(contentFile) ? parseLock(fs.readFileSync(contentFile, 'utf8')) : { source: SOURCE, components: {} };
  const plan = [], refreshed = [], catContent = {};
  for (const [name, p] of Object.entries(rel.parts)) {
    const c = contentLock.components[name] ||= { default: p.version, versions: [], sha256: {}, content: {}, catalogue: '2' };
    // 同じ版の index.js は変わらない約束（format spec §6.1）：違えば、版を付け替えずに中身を変えた部品庫側の誤り
    if (c.sha256[p.version] && c.sha256[p.version] !== p.record.sha256) throw new Error(`${name}@${p.version}: index.js differs from ${LOCK_FILE} (a part version's code is never replaced; this looks like a components-side versioning mistake)`);
    const had = lock.parts[name] && lock.parts[name][p.version];
    if (had && had.sha256 !== p.record.sha256) throw new Error(`${name}@${p.version} is already vendored with index.js sha256 ${had.sha256}; this release has ${p.record.sha256}. A part version is never replaced`);
    for (const f of p.files.keys()) if (safePath(f)) throw new Error(`${name}/${f}: ${safePath(f)}`);
    // このカタログの写しは、このリリースのファイル（README・demo なども含む、format spec §6 の各ファイルの同一性の sha256 から作る一つの hash）。
    // index.js は変わらないが、ほかのファイルだけがカタログの間で変わることがある（取り下げではない直し）。前のカタログの行き先は変えない
    const newHash = contentHash(p.files), oldHash = c.content && c.content[p.version];
    const dest = path.join(vendorDir(path, root), 'sha256', newHash);
    if (!c.versions.includes(p.version)) c.versions.push(p.version);
    c.sha256[p.version] = p.record.sha256;
    if (!oldHash) (c.content ||= {})[p.version] = newHash;
    catContent[name] = newHash;
    const isRefresh = Boolean(oldHash && oldHash !== newHash);
    if (isRefresh) refreshed.push({ name, version: p.version, oldHash, newHash });
    if (fs.existsSync(dest)) {
      // この内容の写しはもうある（同じ版の取り直し、または版をまたいで内容が一致）：index.js が記録と合うか確かめて終わる
      const have = listFiles(dest);
      if (!fs.existsSync(path.join(dest, 'index.js')) || sha(normalizeEol(fs.readFileSync(path.join(dest, 'index.js')))) !== p.record.sha256) throw new Error(`${name}@${p.version}: recorded content has a different index.js`);
      if (contentHash(new Map(have.map((f) => [f, fs.readFileSync(path.join(dest, f))]))) === newHash) continue;
      throw new Error(`${dest}: content hash mismatch`);
    }
    if (!plan.some(([, d]) => d === dest)) plan.push([name, dest, p, isRefresh]);
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
    parts: Object.fromEntries(Object.keys(rel.parts).sort().map((n) => [n, rel.parts[n].version])),
    content: Object.fromEntries(Object.keys(rel.parts).sort().map((n) => [n, catContent[n]])) };
  for (const [name, p] of Object.entries(rel.parts)) (lock.parts[name] ||= {})[p.version] = p.record;
  if (makeDefault || !lock.default || !lock.catalogues[lock.default]) lock.default = rel.version;
  const ordered = {
    source: lock.source, default: lock.default,
    catalogues: Object.fromEntries(Object.keys(lock.catalogues).sort().map((k) => [k, lock.catalogues[k]])),
    parts: Object.fromEntries(Object.keys(lock.parts).sort().map((n) => [n, Object.fromEntries(Object.keys(lock.parts[n]).sort().map((v) => [v, lock.parts[n][v]]))])),
  };
  const problems = lock2Problems(ordered);
  if (problems.length) throw new Error(`${LOCK2_FILE}: ${problems.join('; ')}`);
  fs.writeFileSync(contentFile, JSON.stringify(contentLock, null, 2) + '\n');
  fs.writeFileSync(lockFile, JSON.stringify(ordered, null, 2) + '\n');
  return { written: plan.filter(([, , , isRefresh]) => !isRefresh).map(([n, , p]) => `${n}@${p.version}`), refreshed: refreshed.map((r) => `${r.name}@${r.version}`), parts: Object.keys(rel.parts).length };
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
  let contentLock;
  try { contentLock = parseLock(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8')); } catch (err) { return [err.message]; }
  for (const [name, vs] of Object.entries(lock.parts)) {
    for (const [v, p] of Object.entries(vs)) {
      const dir = resolveComponent(path, root, contentLock, name, v);
      const f = dir && path.join(dir, 'index.js');
      if (!f || !fs.existsSync(f)) { e.push(`${name}@${v}: content table has no available index.js`); continue; }
      if (fs.lstatSync(f).isSymbolicLink()) { e.push(`${name}@${v}: index.js is a symbolic link`); continue; }
      if (sha(normalizeEol(fs.readFileSync(f))) !== p.sha256) e.push(`${name}@${v}: index.js does not match ${LOCK2_FILE}`);
      try {
        const files = new Map(listFiles(dir).map((f) => [f, fs.readFileSync(path.join(dir, f))]));
        if (contentHash(files) !== contentLock.components[name].content[v]) e.push(`${name}@${v}: content hash mismatch`);
      } catch (err) { e.push(err.message); }
    }
  }
  // カタログごとの写し：そのリリースの manifest の files（パーツのフォルダの各ファイルの同一性の sha256）とちょうど同じか
  for (const [cv, cat] of Object.entries(lock.catalogues)) {
    if (!isObj(cat.content)) { e.push(`${LOCK2_FILE}: catalogue ${cv} has no content (run node tools/components2-update.mjs v${cv} again)`); continue; }
    let m = null;
    try { m = JSON.parse(fs.readFileSync(path.join(base, `manifest-${cv}.json`), 'utf8')); } catch { /* 下で manifest がないと言う */ }
    const want = isObj(m) && isObj(m.files) ? m.files : null;
    for (const [name, v] of Object.entries(cat.parts)) {
      const hash = cat.content[name], dir = path.join(vendorDir(path, root), 'sha256', hash);
      if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) { e.push(`catalogue ${cv}: ${name}@${v}: vendor/components/sha256/${hash} is missing`); continue; }
      let files;
      try { files = new Map(listFiles(dir).map((f) => [f, fs.readFileSync(path.join(dir, f))])); } catch (err) { e.push(err.message); continue; }
      if (contentHash(files) !== hash) { e.push(`catalogue ${cv}: ${name}@${v}: content hash mismatch`); continue; }
      if (!files.has('index.js') || sha(normalizeEol(files.get('index.js'))) !== lock.parts[name][v].sha256) e.push(`catalogue ${cv}: ${name}@${v}: index.js does not match ${LOCK2_FILE}`);
      if (!want) continue;
      const listed = Object.keys(want).filter((f) => f.startsWith(name + '/')).map((f) => f.slice(name.length + 1));
      for (const f of listed) if (!files.has(f) || sha(identityBytes(`${name}/${f}`, files.get(f))) !== want[`${name}/${f}`]) e.push(`catalogue ${cv}: ${name}/${f} does not match manifest-${cv}.json`);
      for (const f of files.keys()) if (!listed.includes(f)) e.push(`catalogue ${cv}: ${name}/${f} is not in manifest-${cv}.json`);
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
      console.log(`components 2: catalogues ${Object.keys(lock.catalogues).join(', ')} (default ${lock.default}); ${Object.keys(lock.parts).length} parts; content-addressed code matches ${LOCK2_FILE} and ${LOCK_FILE}`);
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
      if (r.refreshed.length) console.log(`  refreshed (index.js unchanged; other files updated): ${r.refreshed.join(', ')}`);
      console.log(`  ${LOCK2_FILE} updated`);
    }
  } catch (e) {
    console.error(`components 2: ${e.message}`);
    process.exit(1);
  }
}
