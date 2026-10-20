// 部品庫（egatari/components）のリリースを取り込む・写しを確かめる
//   npm run components:update -- vX.Y.Z [--from <フォルダ>]   リリースを取り込む（ネットワークを使うのはこれだけ）
//   npm run components:check                                写しと components.lock.json が合っているか（ネットワークなし。npm test と CI）
//
// 取り込み：リリースの manifest.json と tarball を取り（--from なら、そのフォルダの manifest.json と tarball）、
//   1. manifest の name・version・tag が頼んだ版か、tarball の sha256 が manifest のものか
//   2. tarball の中身が manifest の files とちょうど同じか（ファイルの集まりと各 sha256）。普通のファイルだけ、安全な相対パスだけ（tools/components-tar.mjs）
//   3. 部品の名前（format spec §6 の registry の名前）、各部品の index.js の sha256 が manifest の components のものか
// を確かめてから、部品を vendor/components/<名前>/<版>/ に、LICENSE を vendor/components/LICENSE に書く。取り込んだ版はすべて残す
// （古い版で組んだ教材を組み直すため。消さない）。同じ版がもうあれば、中身が同じことを確かめて書かない（違えば断る：タグは付け替えない約束）。
// components.lock.json に、出どころ（source・tag・tarballSha256）、取り込んだリリースの一覧（releases）、部品ごとの既定の版（今の版）・手元の版の一覧・
// 版ごとの index.js の同一性の sha256（改行をそろえる。kit/core/identity-hash.mjs）と、前の CRLF の記録を引くための crlfSha256 を書く。そのあと `npm run gen`（部品の一覧と AI への指示）と `npm test`。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readTarGz, safePath } from './components-tar.mjs';
import { LOCK_FILE, VENDOR_COMPONENTS, NAME_RE, lockProblems } from '../kit/core/components-lock.mjs';
import { identityBytes, normalizeEol, toCrlf } from '../kit/core/identity-hash.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SOURCE = 'https://github.com/egatari/components';
const PACKAGE = 'egatari-components';
const MAX = 64 * 1024 * 1024;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// 同一性の hash（format spec §6：改行をそろえる。字のファイルだけ）。manifest.json の各ファイルの sha256 と、固定の index.js の sha256 はこれ。
// tarball そのものはバイトのまま（tarball.sha256）
const idSha = (p, b) => sha(identityBytes(p, b));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const cmpVer = (a, b) => {
  const pa = a.split('-')[0].split('.').map(Number), pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return a.includes('-') === b.includes('-') ? (a < b ? -1 : a > b ? 1 : 0) : a.includes('-') ? -1 : 1;
};

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const n = Number(res.headers.get('content-length') || 0);
  if (n > MAX) throw new Error(`${url}: larger than ${MAX} bytes`);
  const b = new Uint8Array(await res.arrayBuffer());
  if (b.length > MAX) throw new Error(`${url}: larger than ${MAX} bytes`);
  return b;
}

// リリースを確かめて、部品ごとのファイルに分ける。返すもの：{version, tarballSha256, license, components: {名前: {sha256, files: Map(相対パス → bytes)}}}
export function verifyRelease(tag, manifestBytes, tarball) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`${tag}: not a release tag vX.Y.Z`);
  const version = tag.slice(1);
  let m;
  try { m = JSON.parse(new TextDecoder().decode(manifestBytes)); } catch (e) { throw new Error(`manifest.json: ${e.message}`); }
  if (!isObj(m) || m.name !== PACKAGE) throw new Error(`manifest.json: name is not ${PACKAGE}`);
  if (m.version !== version || m.tag !== tag) throw new Error(`manifest.json: version ${m.version} / tag ${m.tag}, expected ${version} / ${tag}`);
  if (!isObj(m.tarball) || !/^[0-9a-f]{64}$/.test(m.tarball.sha256 || '')) throw new Error('manifest.json: no tarball.sha256');
  const tsha = sha(tarball);
  if (tsha !== m.tarball.sha256) throw new Error(`tarball sha256 ${tsha} does not match manifest.json (${m.tarball.sha256})`);
  if (!isObj(m.files) || !isObj(m.components)) throw new Error('manifest.json: no files or components');
  const files = readTarGz(tarball, { maxBytes: MAX });
  const listed = Object.keys(m.files);
  for (const p of listed) if (!files.has(p)) throw new Error(`tarball: ${p} is in manifest.json but not in the tarball`);
  for (const [p, b] of files) {
    if (!Object.prototype.hasOwnProperty.call(m.files, p)) throw new Error(`tarball: ${p} is not in manifest.json`);
    if (idSha(p, b) !== m.files[p]) throw new Error(`tarball: ${p} does not match its sha256 in manifest.json`);
  }
  const components = {};
  for (const [name, c] of Object.entries(m.components)) {
    if (!NAME_RE.test(name)) throw new Error(`manifest.json: component "${name}" is not a registry name`);
    const idx = files.get(`${name}/index.js`);
    if (!idx) throw new Error(`tarball: ${name}/index.js is missing`);
    if (!isObj(c) || sha(normalizeEol(idx)) !== c.sha256) throw new Error(`manifest.json: components.${name}.sha256 does not match ${name}/index.js`);
    components[name] = { sha256: c.sha256, crlfSha256: sha(toCrlf(normalizeEol(idx))), files: new Map() };
  }
  let license = null;
  for (const [p, b] of files) {
    if (p === 'LICENSE') { license = b; continue; }
    const name = p.split('/')[0];
    if (!components[name]) throw new Error(`tarball: ${p} is not in a component of manifest.json`);
    components[name].files.set(p.slice(name.length + 1), b);
  }
  return { version, tarballSha256: tsha, license, components };
}

// 写しを書き、components.lock.json を直す。root：リポジトリの根（試験は一時フォルダ）
export function applyRelease(tag, rel, { root = ROOT, source = SOURCE } = {}) {
  const base = path.join(root, ...VENDOR_COMPONENTS);
  const lockFile = path.join(root, LOCK_FILE);
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : { source, components: {} };
  lock.releases ||= {};
  const prev = lock.releases[tag];
  if (prev && prev.tarballSha256 !== rel.tarballSha256) throw new Error(`${tag} was imported before with tarball sha256 ${prev.tarballSha256}; now ${rel.tarballSha256}. Tags are never moved: stop and ask the components maintainer`);
  // 先にすべてを確かめる（同じ版の写しがあれば、中身が同じこと）。書くのはその後
  const plan = [];
  for (const [name, c] of Object.entries(rel.components)) {
    const dest = path.join(base, name, rel.version);
    if (fs.existsSync(dest)) {
      const have = listFiles(dest);
      const want = [...c.files.keys()].sort();
      if (have.join('\n') !== want.join('\n') || want.some((f) => !Buffer.from(c.files.get(f)).equals(fs.readFileSync(path.join(dest, ...f.split('/'))))))
        throw new Error(`vendor/components/${name}/${rel.version} exists with different files; released versions are never replaced`);
      continue;
    }
    for (const f of c.files.keys()) if (safePath(f)) throw new Error(`${name}/${f}: ${safePath(f)}`);
    plan.push([name, dest, c]);
  }
  for (const [, dest, c] of plan) {
    const tmp = dest + '.tmp-' + process.pid;
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [f, b] of c.files) {
      const out = path.join(tmp, ...f.split('/'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, b);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmp, dest);
  }
  if (rel.license) { fs.mkdirSync(base, { recursive: true }); fs.writeFileSync(path.join(base, 'LICENSE'), rel.license); }
  lock.source = source;
  lock.tag = tag;
  lock.tarballSha256 = rel.tarballSha256;
  lock.releases[tag] = { tarballSha256: rel.tarballSha256 };
  lock.releases = Object.fromEntries(Object.entries(lock.releases).sort(([a], [b]) => cmpVer(a.slice(1), b.slice(1))));
  lock.components ||= {};
  for (const [name, c] of Object.entries(rel.components)) {
    const e = lock.components[name] ||= { default: rel.version, versions: [], sha256: {} };
    if (!e.versions.includes(rel.version)) e.versions.push(rel.version);
    e.versions.sort(cmpVer);
    e.sha256 = Object.fromEntries(e.versions.map((v) => [v, v === rel.version ? c.sha256 : e.sha256[v]]));
    e.crlfSha256 = Object.fromEntries(e.versions.filter((v) => v === rel.version || (e.crlfSha256 && e.crlfSha256[v])).map((v) => [v, v === rel.version ? c.crlfSha256 : e.crlfSha256[v]]));
    e.default = rel.version;
  }
  lock.components = Object.fromEntries(Object.entries(lock.components).sort(([a], [b]) => (a < b ? -1 : 1)).map(([n, e]) => [n, { default: e.default, versions: e.versions, sha256: e.sha256, ...(e.crlfSha256 ? { crlfSha256: e.crlfSha256 } : {}) }]));
  const ordered = { source: lock.source, tag: lock.tag, tarballSha256: lock.tarballSha256, releases: lock.releases, components: lock.components };
  const problems = lockProblems(ordered);
  if (problems.length) throw new Error(`${LOCK_FILE}: ${problems.join('; ')}`);
  fs.writeFileSync(lockFile, JSON.stringify(ordered, null, 2) + '\n');
  const kept = Object.keys(lock.components).filter((n) => !rel.components[n]);
  return { added: plan.map(([n]) => n), same: Object.keys(rel.components).filter((n) => !plan.some(([x]) => x === n)), kept };
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

// 写しと固定が合っているか（ネットワークなし）。返すもの：問題の配列
export function checkVendor(root = ROOT) {
  const e = [];
  const lockFile = path.join(root, LOCK_FILE);
  if (!fs.existsSync(lockFile)) return [`${LOCK_FILE} is missing`];
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch (err) { return [`${LOCK_FILE}: ${err.message}`]; }
  e.push(...lockProblems(lock).map((x) => `${LOCK_FILE}: ${x}`));
  if (e.length) return e;
  if (lock.source !== SOURCE) e.push(`${LOCK_FILE}: source is ${lock.source}, expected ${SOURCE}`);
  if (!isObj(lock.releases) || !isObj(lock.releases[lock.tag]) || lock.releases[lock.tag].tarballSha256 !== lock.tarballSha256) e.push(`${LOCK_FILE}: releases.${lock.tag} does not match tag and tarballSha256`);
  const base = path.join(root, ...VENDOR_COMPONENTS);
  for (const [name, c] of Object.entries(lock.components)) {
    for (const v of c.versions) {
      const f = path.join(base, name, v, 'index.js');
      if (!fs.existsSync(f)) { e.push(`vendor/components/${name}/${v}/index.js is missing`); continue; }
      if (fs.lstatSync(f).isSymbolicLink()) { e.push(`vendor/components/${name}/${v}/index.js is a symbolic link`); continue; }
      const code = normalizeEol(fs.readFileSync(f));
      if (sha(code) !== c.sha256[v]) e.push(`vendor/components/${name}/${v}/index.js does not match ${LOCK_FILE}`);
      else if (c.crlfSha256 && c.crlfSha256[v] && sha(toCrlf(code)) !== c.crlfSha256[v]) e.push(`vendor/components/${name}/${v}/index.js does not match ${LOCK_FILE}`);
      try { listFiles(path.join(base, name, v)); } catch (err) { e.push(err.message); }
    }
  }
  for (const d of fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : []) {
    if (!d.isDirectory()) { if (!['LICENSE', 'CATALOG.md'].includes(d.name)) e.push(`vendor/components/${d.name}: not expected`); continue; }
    const c = lock.components[d.name];
    if (!c) { e.push(`vendor/components/${d.name}: not in ${LOCK_FILE}`); continue; }
    for (const v of fs.readdirSync(path.join(base, d.name))) if (!c.versions.includes(v)) e.push(`vendor/components/${d.name}/${v}: not in ${LOCK_FILE}`);
  }
  if (!fs.existsSync(path.join(base, 'LICENSE'))) e.push('vendor/components/LICENSE is missing');
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--check') {
      const e = checkVendor();
      for (const x of e) console.log('FAIL ' + x);
      if (e.length) process.exit(1);
      const lock = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK_FILE), 'utf8'));
      console.log(`components: ${Object.keys(lock.components).length} components from ${lock.source} ${lock.tag}; vendor/components matches ${LOCK_FILE}`);
    } else {
      const fi = args.indexOf('--from');
      const from = fi >= 0 ? path.resolve(args[fi + 1]) : null;
      const tag = args.find((a, i) => !a.startsWith('--') && !(fi >= 0 && i === fi + 1));
      if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) { console.error('usage: npm run components:update -- vX.Y.Z [--from <folder with manifest.json and the tarball>]\n       npm run components:check'); process.exit(2); }
      const file = `${PACKAGE}-${tag}.tar.gz`;
      let manifest, tarball;
      if (from) {
        manifest = fs.readFileSync(path.join(from, 'manifest.json'));
        tarball = fs.readFileSync(path.join(from, file));
      } else {
        const url = `${SOURCE}/releases/download/${tag}`;
        console.log(`downloading ${url}/manifest.json and ${file}`);
        manifest = await download(`${url}/manifest.json`);
        tarball = await download(`${url}/${file}`);
      }
      const rel = verifyRelease(tag, manifest, tarball);
      const r = applyRelease(tag, rel);
      console.log(`${tag}: tarball sha256 ${rel.tarballSha256} (matches manifest.json; ${Object.keys(rel.components).length} components, every file checked)`);
      if (r.added.length) console.log(`  added vendor/components/<name>/${rel.version}/: ${r.added.join(', ')}`);
      if (r.same.length) console.log(`  already present and identical: ${r.same.join(', ')}`);
      if (r.kept.length) console.log(`  not in this release (older versions kept, default unchanged): ${r.kept.join(', ')}`);
      console.log(`  ${LOCK_FILE} updated. Next: npm run gen && npm test`);
    }
  } catch (e) {
    console.error(`components: ${e.message}`);
    process.exit(1);
  }
}
